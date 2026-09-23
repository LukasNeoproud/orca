import { agentSessionProviderHandleChainHead } from '../../../../shared/agent-session-provider-handle'
import type { AgentSessionRecord } from '../../../../shared/agent-session-record'
import type { AgentContextTransitionRequest } from '../../../../shared/agent-context-transition'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'

export function structuredAgentContextScopeFor(
  record: AgentSessionRecord | null,
  sessionId: string
): {
  sessionId: string
  workspaceId: string
  providerSessionId: string
  ownerState: 'live' | 'unverifiable' | 'exited'
} {
  const head = record && agentSessionProviderHandleChainHead(record.providerHandleChain)
  if (
    !record ||
    record.sessionId !== sessionId ||
    record.provider !== 'codex' ||
    record.lease.runtimeKind !== 'native' ||
    record.location.executionHostId !== 'local' ||
    record.location.wslDistro ||
    head?.handle.provider !== 'codex'
  ) {
    throw new Error('agent_context_structured_session_unverifiable')
  }
  const ownerLive =
    record.lease.claimStatus === 'live' &&
    !record.lease.unreconciled &&
    Boolean(record.lease.ownerProcess) &&
    record.lease.provenHandleLinkId === head.linkId
  return {
    sessionId,
    workspaceId: record.location.workspaceId,
    providerSessionId: head.handle.threadId,
    ownerState: ownerLive ? 'live' : record.lease.deathEvidence ? 'exited' : 'unverifiable'
  }
}

export function structuredAgentContextScope(sessionId: string) {
  return structuredAgentContextScopeFor(
    getStructuredAgentSessionHost()?.deps.store.getRecord(sessionId) ?? null,
    sessionId
  )
}

export function structuredAgentContextRequests(
  requests: readonly AgentContextTransitionRequest[],
  sessionId: string
): AgentContextTransitionRequest[] {
  return requests.filter(
    (request) => request.target.sessionId === sessionId && !request.target.terminalHandle
  )
}
