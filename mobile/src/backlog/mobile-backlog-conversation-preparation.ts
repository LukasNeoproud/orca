import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import { isAgentSessionHandleProvider } from '../../../src/shared/agent-session-provider-handle'
import { isResumableTuiAgent } from '../../../src/shared/agent-session-resume'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import { reviewTerminalCreateRun } from '../session/mobile-review-terminal-operations'
import { interpretOrThrowRefusalMessage } from '../transport/rpc-refusal-message'
import { createMobileStructuredAgentSession } from '../session/mobile-structured-agent-session-launch'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { loadMobileBacklogConversations } from './mobile-backlog-task-catalog'
import type { MobileBacklogConversationOption } from './mobile-backlog-task-options'

export type MobileBacklogConversationChoice =
  | { kind: 'new-terminal'; agent: TuiAgent }
  | { kind: 'new-chat'; agent: TuiAgent }
  | { kind: 'existing'; conversation: MobileBacklogConversationOption }

export type PreparedMobileBacklogConversation = {
  option: MobileBacklogConversationOption
  structuredFence?: number
}

export async function prepareMobileBacklogConversation(args: {
  client: RpcClient
  targetWorkspaceId: string
  conversation: MobileBacklogConversationChoice
  attemptId: string
}): Promise<PreparedMobileBacklogConversation> {
  if (args.conversation.kind === 'existing') {
    const selectedConversation = args.conversation.conversation
    const refreshed = (
      await loadMobileBacklogConversations(args.client, args.targetWorkspaceId)
    ).find((candidate) => candidate.id === selectedConversation.id)
    if (!refreshed) {
      throw new Error('The selected conversation is no longer available.')
    }
    return refreshed.surface === 'structured'
      ? { option: refreshed, structuredFence: await readStructuredFence(args.client, refreshed) }
      : { option: refreshed }
  }
  if (args.conversation.kind === 'new-chat') {
    if (!isAgentSessionHandleProvider(args.conversation.agent)) {
      throw new Error('The selected agent does not support structured chat.')
    }
    const created = await createMobileStructuredAgentSession(
      args.client,
      args.targetWorkspaceId,
      args.conversation.agent
    )
    if (created.kind !== 'created') {
      throw new Error(
        created.kind === 'unsupported'
          ? 'Structured chat is unavailable on this host.'
          : created.message
      )
    }
    const option: MobileBacklogConversationOption = {
      id: `structured:${created.sessionId}`,
      title: `${args.conversation.agent} chat`,
      surface: 'structured',
      agent: args.conversation.agent,
      session: { structuredSessionId: created.sessionId, agent: args.conversation.agent }
    }
    return { option, structuredFence: await readStructuredFence(args.client, option) }
  }
  const created = await reviewTerminalCreateRun.request(
    args.client,
    {
      worktree: `id:${args.targetWorkspaceId}`,
      agent: args.conversation.agent,
      clientMutationId: args.attemptId,
      activate: false,
      select: true,
      navigation: 'caller'
    },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  const tab = interpretOrThrowRefusalMessage(
    () => reviewTerminalCreateRun.interpret(created),
    'Unable to start the agent conversation.'
  )
  return {
    option: {
      id: `terminal:${tab.id}`,
      title: tab.title,
      surface: 'terminal',
      agent: args.conversation.agent,
      session: { title: tab.title, agent: args.conversation.agent },
      terminal: {
        tabId: tab.id,
        ...(isResumableTuiAgent(args.conversation.agent)
          ? { launchAgent: args.conversation.agent }
          : {})
      },
      terminalHandle: tab.terminal
    }
  }
}

async function readStructuredFence(
  client: Pick<RpcClient, 'sendRequest'>,
  option: MobileBacklogConversationOption
): Promise<number> {
  const sessionId = option.session.structuredSessionId
  if (!sessionId) {
    throw new Error('The structured conversation is unavailable.')
  }
  const response = await client.sendRequest(
    'agentSession.history',
    { sessionId, direction: 'tail', limit: 1 },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to read the conversation checkpoint.')
  }
  const history = (response as RpcSuccess).result as AgentSessionHistoryResult
  const fence = history.page.fence ?? (!history.ok ? history.fence : undefined)
  if (fence === undefined) {
    throw new Error('The structured conversation checkpoint is unavailable.')
  }
  return fence
}
