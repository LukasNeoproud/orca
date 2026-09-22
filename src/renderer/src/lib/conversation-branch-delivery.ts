import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  AgentSessionHistoryResult,
  AgentSessionMutationEnvelope
} from '../../../shared/agent-session-wire'
import { structuredAgentSessionPayloadFingerprint } from '../../../shared/structured-agent-session-mutation'
import { structuredAgentSessionSendBody } from '../../../shared/structured-agent-session-outbox'
import { callConversationBranch } from './structured-conversation-branch-client'

export async function conversationDeliveryEnvelope(
  target: RuntimeClientTarget,
  sessionId: string,
  clientOperationId: string,
  content: string
): Promise<AgentSessionMutationEnvelope> {
  const result = await callConversationBranch<AgentSessionHistoryResult>(
    target,
    'agentSession.history',
    {
      sessionId,
      direction: 'tail',
      limit: 1
    }
  )
  const fence = result.page.fence ?? (!result.ok ? result.fence : undefined)
  if (fence === undefined) {
    throw new Error('The conversation checkpoint is unavailable. Reconnect before sending.')
  }
  return {
    sessionId,
    clientOperationId,
    expectedRuntimeFence: fence,
    payloadFingerprint: structuredAgentSessionPayloadFingerprint({
      method: 'agentSession.send',
      sessionId,
      fields: { body: structuredAgentSessionSendBody(content, []) }
    })
  }
}
