import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type {
  AgentSessionHandoffRequest,
  AgentSessionHandoffStatus
} from '../../../shared/agent-session-wire'
import { refuseAdmittedStructuredHandoff } from './structured-agent-session-handoff-admission'
import type { StructuredAgentSessionHandoffOperationGuard } from './structured-agent-session-handoff-operation-guard'
import type { StructuredAgentSessionHandoffQueue } from './structured-agent-session-handoff-queue'
import { structuredHandoffSuccess } from './structured-agent-session-handoff-result'
import { idleStructuredHandoffStatus } from './structured-agent-session-handoff-status'
import type { StructuredAgentSessionHandoffDeps } from './structured-agent-session-handoff-types'

export async function cancelQueuedStructuredHandoff(input: {
  deps: StructuredAgentSessionHandoffDeps
  operationGuard: StructuredAgentSessionHandoffOperationGuard
  queue: StructuredAgentSessionHandoffQueue
  callerKey: string
  params: AgentSessionHandoffRequest
  record: AgentSessionRecord
  currentStatus?: AgentSessionHandoffStatus
  setStatus: (sessionId: string, status: AgentSessionHandoffStatus) => void
}) {
  const { record, currentStatus, params } = input
  const matching = currentStatus?.phase === 'queued' && currentStatus.direction === params.direction
  if (!matching || !input.queue.cancel(record.sessionId)) {
    return refuseAdmittedStructuredHandoff({
      ...input,
      refusal: {
        code: 'agent_session_operation_conflict',
        message: matching
          ? 'The queued handoff has already started.'
          : 'No matching queued handoff exists.'
      }
    })
  }
  const status = idleStructuredHandoffStatus(record)
  input.setStatus(record.sessionId, status)
  if (currentStatus.operationId) {
    await input.operationGuard.settle(record.sessionId, currentStatus.operationId, {
      status: 'succeeded',
      sessionId: record.sessionId
    })
  }
  await input.deps.store.recordOperationOutcome({
    callerKey: input.callerKey,
    operationId: params.envelope.clientOperationId,
    outcome: { status: 'succeeded', sessionId: record.sessionId }
  })
  return structuredHandoffSuccess(input.deps, record.sessionId, false, status)
}
