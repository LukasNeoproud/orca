import type {
  BacklogTaskAssociation,
  BacklogTaskAssociationWorkspace
} from '../../../shared/backlog-task-association'
import type {
  AgentSessionHistoryResult,
  AgentSessionMutationResult,
  AgentSessionSendResult
} from '../../../shared/agent-session-wire'
import { agentSessionSendSubmission } from '../../../shared/agent-session-wire'
import type { TuiAgent } from '../../../shared/tui-agent'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { deliverLaunchPromptToAgentTab } from '@/lib/agent-launch-prompt-delivery'
import { sendNotesToActiveAgentSession } from '@/lib/active-agent-note-send'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../../../shared/structured-agent-session-send-mutation'
import { createStructuredAgentSessionOperationId } from '../../../shared/structured-agent-session-mutation'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { callBacklog, type BacklogRoute } from './backlog-rpc'
import {
  confirmBacklogTaskAssociation,
  saveBacklogTaskAssociation
} from './backlog-task-association-client'
import { buildBacklogTaskHandoffPrompt } from './backlog-task-handoff-prompt'
import type { BacklogTask } from '../../../shared/backlog-types'
import type { BacklogTaskConversationOption } from './backlog-task-handoff-options'
import { getBacklogTaskWorkspaceOptions } from './backlog-task-handoff-options'
import {
  activateBacklogTaskStructuredConversation,
  activateBacklogTaskTerminal
} from './backlog-task-conversation-activation'
import { prepareExistingBacklogConversation } from './backlog-task-handoff-existing-conversation'
import {
  prepareNewBacklogConversation,
  type PreparedBacklogConversation
} from './backlog-task-handoff-preparation'
import { waitForBacklogTerminalProviderSession } from './backlog-task-handoff-terminal-identity'
import { createBrowserUuid } from '@/lib/browser-uuid'

export type { BacklogTaskConversationOption } from './backlog-task-handoff-options'
export {
  getBacklogTaskConversationOptions,
  getBacklogTaskWorkspaceOptions
} from './backlog-task-handoff-options'
export { continueBacklogTask, type BacklogTaskContinueResult } from './backlog-task-continue'

export type BacklogTaskConversationChoice =
  | { kind: 'new'; agent: TuiAgent; surface?: 'auto' | 'structured' }
  | { kind: 'existing'; conversation: BacklogTaskConversationOption }

export type BacklogTaskHandoffResult = {
  association: BacklogTaskAssociation
  status: 'confirmed' | 'unverified'
}

export class BacklogTaskHandoffError extends Error {
  constructor(
    message: string,
    readonly association: BacklogTaskAssociation | null = null
  ) {
    super(message)
    this.name = 'BacklogTaskHandoffError'
  }
}

function workspaceRef(workspaceId: string): BacklogTaskAssociationWorkspace {
  return {
    workspaceId,
    kind: parseWorkspaceKey(workspaceId)?.type === 'folder' ? 'folder' : 'git-worktree'
  }
}

function structuredTarget(route: BacklogRoute): RuntimeClientTarget {
  return route.runtimeEnvironmentId
    ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' }
}

async function structuredFence(route: BacklogRoute, sessionId: string): Promise<number> {
  const result = await callStructuredAgentSession<AgentSessionHistoryResult>(
    structuredTarget(route),
    'agentSession.history',
    { sessionId, direction: 'tail', limit: 1 }
  )
  const fence = result.page.fence ?? (!result.ok ? result.fence : undefined)
  if (fence === undefined) {
    throw new Error('The structured conversation checkpoint is unavailable.')
  }
  return fence
}

async function sendStructuredPrompt(
  route: BacklogRoute,
  sessionId: string,
  prompt: string,
  clientMessageId: string,
  knownFence?: number
): Promise<boolean> {
  const fence = knownFence ?? (await structuredFence(route, sessionId))
  const params = structuredAgentSessionMessageSendMutation({
    sessionId,
    clientOperationId: clientMessageId,
    expectedRuntimeFence: fence,
    body: structuredAgentSessionSendBody(prompt, [])
  })
  const result = await callStructuredAgentSession<
    AgentSessionMutationResult<AgentSessionSendResult>
  >(structuredTarget(route), 'agentSession.send', params)
  return result.ok && agentSessionSendSubmission(result.value)?.dispatchState === 'accepted'
}

async function freshTask(sourceRoute: BacklogRoute, taskId: string): Promise<BacklogTask> {
  return callBacklog<BacklogTask>(sourceRoute, 'task', { taskId })
}

function associationWrite(args: {
  taskId: string
  targetWorkspaceId: string
  prepared: PreparedBacklogConversation
  attemptId: string
  expectedAttemptId: string | null
  deliveryStatus: 'pending' | 'unverified'
}) {
  return {
    taskId: args.taskId,
    targetWorkspace: workspaceRef(args.targetWorkspaceId),
    session: args.prepared.session,
    ...(args.prepared.terminal ? { terminal: args.prepared.terminal } : {}),
    attemptId: args.attemptId,
    deliveryStatus: args.deliveryStatus,
    expectedAttemptId: args.expectedAttemptId
  }
}

export async function startBacklogTask(args: {
  sourceRoute: BacklogRoute
  taskId: string
  targetRoute: BacklogRoute
  conversation: BacklogTaskConversationChoice
  expectedAttemptId: string | null
}): Promise<BacklogTaskHandoffResult> {
  if (
    args.sourceRoute.executionHostId !== args.targetRoute.executionHostId ||
    args.sourceRoute.runtimeEnvironmentId !== args.targetRoute.runtimeEnvironmentId ||
    !getBacklogTaskWorkspaceOptions(args.sourceRoute).some(
      (workspace) => workspace.id === args.targetRoute.workspaceId
    )
  ) {
    throw new BacklogTaskHandoffError(
      'The target workspace must belong to the same project and execution host.'
    )
  }
  const task = await freshTask(args.sourceRoute, args.taskId)
  const prompt = buildBacklogTaskHandoffPrompt(task)
  const prepared =
    args.conversation.kind === 'new'
      ? await prepareNewBacklogConversation(
          args.targetRoute,
          args.conversation.agent,
          args.conversation.surface ?? 'auto'
        )
      : await prepareExistingBacklogConversation(args.targetRoute, args.conversation.conversation)
  prepared.session = {
    ...prepared.session,
    agent: prepared.agent,
    title: (args.conversation.kind === 'existing'
      ? args.conversation.conversation.title
      : task.title
    ).slice(0, 512)
  }
  if (
    prepared.surface === 'terminal' &&
    prepared.terminal &&
    !prepared.launchedTerminal &&
    !prepared.terminal.leafId
  ) {
    throw new BacklogTaskHandoffError('The selected terminal pane is no longer available.')
  }
  const attemptId = createStructuredAgentSessionOperationId(createBrowserUuid)
  let association = await saveBacklogTaskAssociation(
    args.sourceRoute,
    associationWrite({
      taskId: task.id,
      targetWorkspaceId: args.targetRoute.workspaceId,
      prepared,
      attemptId,
      expectedAttemptId: args.expectedAttemptId,
      deliveryStatus: 'pending'
    })
  )
  try {
    if (prepared.surface === 'structured') {
      const sessionId = prepared.session.structuredSessionId
      if (!sessionId) {
        throw new Error('The structured conversation is unavailable.')
      }
      const accepted = await sendStructuredPrompt(
        args.targetRoute,
        sessionId,
        prompt,
        attemptId,
        prepared.structuredFence
      )
      if (!accepted) {
        throw new Error('Task delivery is unconfirmed; Orca will not send it again automatically.')
      }
      association = await confirmBacklogTaskAssociation(args.sourceRoute, task.id, attemptId)
      await activateBacklogTaskStructuredConversation(args.targetRoute, sessionId)
      return { association, status: 'confirmed' }
    }
    if (!prepared.terminal) {
      throw new Error('The terminal conversation is unavailable.')
    }
    const delivered = prepared.launchedTerminal
      ? await deliverLaunchPromptToAgentTab({
          tabId: prepared.terminal.tabId,
          agent: prepared.agent,
          content: prompt,
          submit: true,
          forcePaste: true
        })
      : (
          await sendNotesToActiveAgentSession({
            worktreeId: args.targetRoute.workspaceId,
            prompt,
            runtimeTarget: structuredTarget(args.targetRoute),
            ...(prepared.terminal.leafId
              ? {
                  noteTarget: {
                    tabId: prepared.terminal.tabId,
                    leafId: prepared.terminal.leafId
                  }
                }
              : {})
          })
        ).status === 'sent'
    if (!delivered) {
      throw new Error('The terminal did not accept the task prompt.')
    }
    activateBacklogTaskTerminal(args.targetRoute, prepared.terminal.tabId, prepared.terminal.leafId)
    if (prepared.launchedTerminal && !prepared.session.providerSession) {
      const providerSessionPromise = waitForBacklogTerminalProviderSession(
        prepared.terminal.paneKey,
        60_000
      )
      const providerSession = await Promise.race([
        providerSessionPromise,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 15_000))
      ])
      if (!providerSession) {
        void providerSessionPromise.then(async (lateProviderSession) => {
          if (!lateProviderSession) {
            return
          }
          prepared.session = { ...prepared.session, providerSession: lateProviderSession }
          await saveBacklogTaskAssociation(
            args.sourceRoute,
            associationWrite({
              taskId: task.id,
              targetWorkspaceId: args.targetRoute.workspaceId,
              prepared,
              attemptId,
              expectedAttemptId: attemptId,
              deliveryStatus: 'unverified'
            })
          ).catch(() => {})
        })
        throw new Error('The task was sent, but the agent session identity is not available yet.')
      }
      prepared.session = { ...prepared.session, providerSession }
    }
    association = await saveBacklogTaskAssociation(
      args.sourceRoute,
      associationWrite({
        taskId: task.id,
        targetWorkspaceId: args.targetRoute.workspaceId,
        prepared,
        attemptId,
        expectedAttemptId: attemptId,
        deliveryStatus: 'unverified'
      })
    )
    return { association, status: 'unverified' }
  } catch (error) {
    throw new BacklogTaskHandoffError(
      error instanceof Error ? error.message : String(error),
      association
    )
  }
}
