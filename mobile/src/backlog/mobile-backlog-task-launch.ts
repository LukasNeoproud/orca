import {
  agentSessionSendSubmission,
  type AgentSessionMutationResult,
  type AgentSessionSendResult
} from '../../../src/shared/agent-session-wire'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import type { BacklogTask } from '../../../src/shared/backlog-types'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../../../src/shared/structured-agent-session-send-mutation'
import { sendMobileNativeChatMessageWithOutcome } from '../session/mobile-native-chat-send'
import { activateMobileSessionTab } from '../session/mobile-session-tab-activation'
import { structuredSessionOperationId } from '../session/structured-session-operation-id'
import { revealMobileStructuredAgentSession } from '../session/mobile-structured-agent-session-launch'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import {
  confirmMobileBacklogTaskAssociation,
  saveMobileBacklogTaskAssociation
} from './mobile-backlog-task-association-client'
import { loadMobileBacklogWorkspaces } from './mobile-backlog-task-catalog'
import {
  prepareMobileBacklogConversation,
  type MobileBacklogConversationChoice
} from './mobile-backlog-conversation-preparation'
import {
  mobileBacklogAssociationWorkspace,
  type MobileBacklogConversationOption
} from './mobile-backlog-task-options'
import { buildMobileBacklogTaskPrompt } from './mobile-backlog-task-prompt'

export type { MobileBacklogConversationChoice } from './mobile-backlog-conversation-preparation'

export type MobileBacklogTaskLaunchOutcome = {
  association: BacklogTaskAssociation
  delivery: 'confirmed' | 'unverified'
  opened: boolean
  message: string
  worktreeId: string
}

export async function startMobileBacklogTask(args: {
  client: RpcClient
  sourceWorkspaceId: string
  taskId: string
  targetWorkspaceId: string
  conversation: MobileBacklogConversationChoice
  expectedAttemptId: string | null
  createAttemptId?: () => string
}): Promise<MobileBacklogTaskLaunchOutcome> {
  const workspaces = await loadMobileBacklogWorkspaces(args.client, args.sourceWorkspaceId)
  const targetWorkspace = workspaces.find(
    (workspace) => workspace.worktreeId === args.targetWorkspaceId
  )
  if (!targetWorkspace) {
    throw new Error('Choose a workspace from the same project and execution host.')
  }
  const task = await loadFreshTask(args.client, args.sourceWorkspaceId, args.taskId)
  const attemptId = (args.createAttemptId ?? structuredSessionOperationId)()
  const prepared = await prepareMobileBacklogConversation({
    client: args.client,
    targetWorkspaceId: args.targetWorkspaceId,
    conversation: args.conversation,
    attemptId
  })
  const option = prepared.option
  let association = await saveMobileBacklogTaskAssociation(args.client, args.sourceWorkspaceId, {
    taskId: task.id,
    targetWorkspace: mobileBacklogAssociationWorkspace(targetWorkspace),
    session: {
      ...option.session,
      title: (args.conversation.kind === 'existing' ? option.title : task.title).slice(0, 512),
      agent: option.agent
    },
    ...(option.terminal ? { terminal: option.terminal } : {}),
    attemptId,
    deliveryStatus: 'pending',
    expectedAttemptId: args.expectedAttemptId
  })
  const prompt = buildMobileBacklogTaskPrompt(task)
  if (option.surface === 'structured') {
    const sessionId = option.session.structuredSessionId
    if (!sessionId || prepared.structuredFence === undefined) {
      return outcome(association, false, 'Structured delivery is unverified.')
    }
    const accepted = await sendStructuredPrompt(
      args.client,
      sessionId,
      prompt,
      attemptId,
      prepared.structuredFence
    )
    if (!accepted) {
      return outcome(
        association,
        await revealStructured(args.client, sessionId),
        unverifiedMessage()
      )
    }
    try {
      association = await confirmMobileBacklogTaskAssociation(
        args.client,
        args.sourceWorkspaceId,
        task.id,
        attemptId
      )
    } catch {
      return outcome(
        association,
        await revealStructured(args.client, sessionId),
        unverifiedMessage()
      )
    }
    return outcome(
      association,
      await revealStructured(args.client, sessionId),
      'Task handed to the conversation.'
    )
  }

  const sent = option.terminalHandle
    ? await sendMobileNativeChatMessageWithOutcome({
        client: args.client,
        terminal: option.terminalHandle,
        text: prompt
      })
    : 'rejected'
  if (sent === 'accepted') {
    try {
      association = await saveMobileBacklogTaskAssociation(args.client, args.sourceWorkspaceId, {
        taskId: task.id,
        targetWorkspace: mobileBacklogAssociationWorkspace(targetWorkspace),
        session: association.session,
        ...(association.terminal ? { terminal: association.terminal } : {}),
        attemptId,
        deliveryStatus: 'unverified',
        expectedAttemptId: attemptId
      })
    } catch {
      // The pending association still fences retries when the status update is ambiguous.
    }
  }
  const opened = option.terminal
    ? await activateTerminal(args.client, args.targetWorkspaceId, option.terminal)
    : false
  return outcome(association, opened, unverifiedMessage())

  function outcome(
    saved: BacklogTaskAssociation,
    opened: boolean,
    message: string
  ): MobileBacklogTaskLaunchOutcome {
    return {
      association: saved,
      delivery: saved.deliveryStatus === 'confirmed' ? 'confirmed' : 'unverified',
      opened,
      message,
      worktreeId: args.targetWorkspaceId
    }
  }
}

async function loadFreshTask(
  client: Pick<RpcClient, 'sendRequest'>,
  workspaceId: string,
  taskId: string
): Promise<BacklogTask> {
  const response = await client.sendRequest(
    'backlog.task',
    { workspaceId, taskId },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to refresh the Backlog task.')
  }
  return (response as RpcSuccess).result as BacklogTask
}

async function sendStructuredPrompt(
  client: Pick<RpcClient, 'sendRequest'>,
  sessionId: string,
  prompt: string,
  attemptId: string,
  fence: number
): Promise<boolean> {
  const params = structuredAgentSessionMessageSendMutation({
    sessionId,
    clientOperationId: attemptId,
    expectedRuntimeFence: fence,
    body: structuredAgentSessionSendBody(prompt, [])
  })
  try {
    const response = await client.sendRequest('agentSession.send', params, {
      timeoutMs: 15_000,
      budgetSpansConnect: true
    })
    if (!response.ok) {
      return false
    }
    const result = (response as RpcSuccess)
      .result as AgentSessionMutationResult<AgentSessionSendResult>
    return result.ok && agentSessionSendSubmission(result.value)?.dispatchState === 'accepted'
  } catch {
    return false
  }
}

async function revealStructured(
  client: Pick<RpcClient, 'sendRequest'>,
  sessionId: string
): Promise<boolean> {
  try {
    await revealMobileStructuredAgentSession(client, sessionId)
    return true
  } catch {
    return false
  }
}

async function activateTerminal(
  client: Pick<RpcClient, 'sendRequest'>,
  worktreeId: string,
  terminal: NonNullable<MobileBacklogConversationOption['terminal']>
): Promise<boolean> {
  try {
    const response = await activateMobileSessionTab(client, {
      worktree: `id:${worktreeId}`,
      tabId: terminal.tabId,
      ...(terminal.leafId ? { leafId: terminal.leafId } : {}),
      notifyClients: false,
      navigation: 'caller',
      intent: 'user'
    })
    return response.ok
  } catch {
    return false
  }
}

function unverifiedMessage(): string {
  return 'Delivery is unverified. Check the linked conversation before sending again.'
}
