import type { AgentJournalSnapshot } from '../../../shared/agent-session-journal-types'
import type { StructuredAgentSessionAdapter } from './structured-agent-session-adapter'

type ForkRequest = Parameters<NonNullable<StructuredAgentSessionAdapter['forkConversation']>>[0]

export function forkStructuredAgentSessionConversation(input: {
  request: ForkRequest & { expectedEpoch: string }
  adapter: StructuredAgentSessionAdapter
  serialize: <T>(sessionId: string, task: () => Promise<T>) => Promise<T>
  snapshot: (sessionId: string) => AgentJournalSnapshot
}): Promise<{ providerSessionId: string }> {
  return input.serialize(input.request.sourceSessionId, async () => {
    const snapshot = input.snapshot(input.request.sourceSessionId)
    if (
      snapshot.cursor.epoch !== input.request.expectedEpoch ||
      !snapshot.items.some((item) => item.itemId === input.request.boundaryItemId)
    ) {
      throw new Error('agent_session_branch_source_stale')
    }
    if (
      snapshot.items.some(
        (item) => item.body.kind === 'status' && item.body.turnLifecycle?.state === 'running'
      )
    ) {
      throw new Error('agent_session_branch_source_busy')
    }
    const fork = input.adapter.forkConversation
    if (!fork) {
      throw new Error('agent_session_branch_provider_unsupported')
    }
    return fork(input.request)
  })
}
