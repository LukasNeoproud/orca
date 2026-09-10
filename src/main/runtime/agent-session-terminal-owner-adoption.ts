import type {
  AgentSessionProcessIdentity,
  AgentSessionRecord
} from '../../shared/agent-session-record'
import type { AgentSessionAdoptedTerminal } from '../../shared/structured-agent-session-terminal-adoption'
import {
  agentSessionOperationKey,
  settleAgentSessionOperation
} from '../../shared/agent-session-operation-ledger'
import type { AgentSessionStoreState } from './agent-session-record-store-file'
import {
  applyAgentSessionReservation,
  evaluateAgentSessionReserveOperation,
  requireAgentSessionRecordForReplay,
  type AgentSessionReserveRequest
} from './agent-session-reservation-admission'
import {
  commitAgentSessionProcessIdentity,
  proveAgentSessionOwner
} from './agent-session-lease-transitions'

export type AgentSessionTerminalOwnerAdoption = {
  request: AgentSessionReserveRequest
  process: AgentSessionProcessIdentity
  terminal: AgentSessionAdoptedTerminal
}

/** One commit prevents a crash from leaving an adopted live child behind a processless reservation. */
export function adoptAgentSessionTerminalOwner(
  state: AgentSessionStoreState,
  input: AgentSessionTerminalOwnerAdoption,
  leaseTtlMs: number
): AgentSessionRecord {
  const { request } = input
  if (
    request.runtimeKind !== 'tui' ||
    !request.adoptedHandleLink ||
    input.process.processStartTimeMs === null
  ) {
    throw new Error('agent_session_identity_required')
  }
  const admission = evaluateAgentSessionReserveOperation(state, request)
  if (admission.decision === 'refused') {
    throw new Error(admission.code)
  }
  if (admission.decision === 'replay') {
    return requireAgentSessionRecordForReplay(state, admission.row, request.sessionId)
  }
  const reserved = applyAgentSessionReservation(state, request, leaseTtlMs)
  if (reserved.disposition !== 'created') {
    throw new Error('agent_session_conflict')
  }
  const record = proveAgentSessionOwner({
    record: commitAgentSessionProcessIdentity({
      // The provisional adopted root becomes proven in this same transaction, exactly once.
      record: { ...reserved.record, providerHandleChain: [] },
      sessionId: request.sessionId,
      fence: reserved.record.lease.runtimeFence,
      process: input.process,
      now: request.now
    }),
    fence: reserved.record.lease.runtimeFence,
    link: request.adoptedHandleLink,
    now: request.now,
    leaseTtlMs
  })
  const adopted = { ...record, adoptedTerminal: input.terminal }
  state.records.set(record.sessionId, adopted)
  state.operations.set(
    agentSessionOperationKey(request.operation.callerKey, request.operation.operationId),
    admission.row
  )
  state.operations = settleAgentSessionOperation(state.operations, {
    callerKey: request.operation.callerKey,
    operationId: request.operation.operationId,
    outcome: { status: 'succeeded', sessionId: record.sessionId }
  })
  return adopted
}
