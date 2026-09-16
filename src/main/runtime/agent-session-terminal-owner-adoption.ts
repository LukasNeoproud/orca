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
import { agentSessionProviderHandleRoot } from '../../shared/agent-session-provider-handle'
import {
  detachPreviousTerminalConversation,
  readoptTerminalReservation,
  sameTerminalProcess,
  type TerminalAdoptionExistingOwner,
  type TerminalAdoptionPreviousOwner
} from './agent-session-terminal-owner-readoption'

export type AgentSessionTerminalOwnerAdoption = {
  request: AgentSessionReserveRequest
  process: AgentSessionProcessIdentity
  terminal: AgentSessionAdoptedTerminal
  existing?: TerminalAdoptionExistingOwner
  previous?: TerminalAdoptionPreviousOwner
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
    const record = requireAgentSessionRecordForReplay(state, admission.row, request.sessionId)
    const head = record.providerHandleChain.at(-1)
    if (
      record.sessionId !== request.sessionId ||
      !head ||
      agentSessionProviderHandleRoot(head.handle) !==
        agentSessionProviderHandleRoot(request.adoptedHandleLink.handle) ||
      !sameTerminalProcess(record.lease.ownerProcess, input.process) ||
      record.lease.unreconciled ||
      record.lease.settlementRetryRequired ||
      record.lease.claimStatus !== 'live' ||
      record.lease.runtimeKind !== 'tui' ||
      record.lease.handoffStage !== null
    ) {
      throw new Error('agent_session_operation_conflict')
    }
    return record
  }
  let reserved: AgentSessionRecord
  if (input.existing) {
    reserved = readoptTerminalReservation(state, input, leaseTtlMs)
  } else {
    const created = applyAgentSessionReservation(state, request, leaseTtlMs)
    if (created.disposition !== 'created') {
      throw new Error('agent_session_conflict')
    }
    // The provisional adopted root becomes proven in this same transaction, exactly once.
    reserved = { ...created.record, providerHandleChain: [] }
  }
  const record = proveAgentSessionOwner({
    record: commitAgentSessionProcessIdentity({
      record: reserved,
      sessionId: request.sessionId,
      fence: reserved.lease.runtimeFence,
      process: input.process,
      now: request.now
    }),
    fence: reserved.lease.runtimeFence,
    link: request.adoptedHandleLink,
    now: request.now,
    leaseTtlMs
  })
  detachPreviousTerminalConversation(state, input)
  const adopted = {
    ...record,
    adoptedTerminal: { ...input.terminal, ownerFence: record.lease.runtimeFence }
  }
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
