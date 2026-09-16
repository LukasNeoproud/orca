import {
  agentSessionExecutionLocationsEqual,
  type AgentSessionProcessIdentity,
  type AgentSessionRecord
} from '../../shared/agent-session-record'
import { agentSessionProviderHandleRoot } from '../../shared/agent-session-provider-handle'
import { nextAgentSessionFence } from '../../shared/agent-session-next-fence'
import type { AgentSessionStoreState } from './agent-session-record-store-file'
import type { AgentSessionTerminalOwnerAdoption } from './agent-session-terminal-owner-adoption'
import { reserveAgentSessionOwner } from './agent-session-lease-transitions'

export type TerminalAdoptionExistingOwner = {
  sessionId: string
  fence: number
  mode: 'live' | 'released' | 'reserved'
}
export type TerminalAdoptionPreviousOwner = { sessionId: string; fence: number }

export function sameTerminalProcess(
  left: AgentSessionProcessIdentity | null,
  right: AgentSessionProcessIdentity
): boolean {
  return Boolean(
    left &&
    left.hostId === right.hostId &&
    left.pid === right.pid &&
    left.processStartTimeMs !== null &&
    left.processStartTimeMs === right.processStartTimeMs
  )
}

export function detachPreviousTerminalConversation(
  state: AgentSessionStoreState,
  input: AgentSessionTerminalOwnerAdoption
): void {
  if (!input.previous) {
    return
  }
  const record = state.records.get(input.previous.sessionId)
  const lease = record?.lease
  if (
    !record ||
    !lease ||
    lease.runtimeFence !== input.previous.fence ||
    lease.unreconciled ||
    lease.runtimeKind !== 'tui' ||
    lease.claimStatus !== 'live' ||
    lease.handoffStage !== null ||
    !sameTerminalProcess(lease.ownerProcess, input.process) ||
    record.sessionId === input.request.sessionId ||
    !agentSessionExecutionLocationsEqual(record.location, input.request.location) ||
    record.provider !== input.request.provider ||
    record.accountHome.path !== input.request.accountHome.path ||
    lease.settlementRetryRequired
  ) {
    throw new Error('agent_session_conflict')
  }
  state.records.set(record.sessionId, {
    ...record,
    updatedAt: input.request.now,
    lease: {
      ...lease,
      runtimeFence: nextAgentSessionFence(lease),
      claimStatus: 'released',
      ownerProcess: null,
      reservedSpawnToken: null,
      provenHandleLinkId: null,
      handoffOperationId: null,
      deathEvidence: null,
      leaseDeadlineAt: input.request.now,
      lastRenewedAt: input.request.now
    }
  })
  if (state.visibleSessionIds.delete(record.sessionId)) {
    state.visibleSessionIds.add(input.request.sessionId)
  }
}

export function readoptTerminalReservation(
  state: AgentSessionStoreState,
  input: AgentSessionTerminalOwnerAdoption,
  leaseTtlMs: number
): AgentSessionRecord {
  const admission = input.existing!
  const record = state.records.get(admission.sessionId)
  if (
    !record ||
    record.sessionId !== input.request.sessionId ||
    record.lease.runtimeFence !== admission.fence ||
    record.lease.unreconciled ||
    record.lease.settlementRetryRequired
  ) {
    throw new Error('agent_session_checkpoint_stale')
  }
  const lease = record.lease
  const root = record.providerHandleChain.at(-1)?.handle
  const expected = input.request.adoptedHandleLink?.handle
  if (
    !root ||
    !expected ||
    agentSessionProviderHandleRoot(root) !== agentSessionProviderHandleRoot(expected) ||
    !agentSessionExecutionLocationsEqual(record.location, input.request.location) ||
    record.accountHome.path !== input.request.accountHome.path
  ) {
    throw new Error('agent_session_identity_required')
  }
  let reserved: AgentSessionRecord
  if (admission.mode === 'released') {
    if (
      lease.claimStatus !== 'released' ||
      lease.ownerProcess ||
      lease.reservedSpawnToken ||
      lease.handoffStage !== null
    ) {
      throw new Error('agent_session_conflict')
    }
    reserved = reserveAgentSessionOwner({
      record,
      expectedFence: lease.runtimeFence,
      probe: { outcome: 'reservation-unused' },
      reservation: {
        runtimeKind: 'tui',
        spawnToken: input.process.spawnToken,
        claimKeyId: input.request.claimKeyId,
        handoffOperationId: null,
        now: input.request.now,
        leaseTtlMs
      }
    }).record
  } else {
    const currentOwner =
      admission.mode === 'live' &&
      lease.claimStatus === 'live' &&
      sameTerminalProcess(lease.ownerProcess, input.process) &&
      lease.ownerProcess?.spawnToken === input.process.spawnToken &&
      [null, 'recovering', 'manual-recovery'].includes(lease.handoffStage)
    const pendingOwner =
      admission.mode === 'reserved' &&
      lease.claimStatus === 'reserved' &&
      lease.ownerProcess === null &&
      lease.reservedSpawnToken === input.process.spawnToken &&
      ['recovering', 'manual-recovery'].includes(lease.handoffStage ?? '')
    if (lease.runtimeKind !== 'tui' || (!currentOwner && !pendingOwner)) {
      throw new Error('agent_session_conflict')
    }
    reserved = {
      ...record,
      lease: {
        ...lease,
        claimStatus: 'reserved',
        handoffStage: 'new-owner-proving',
        ownerProcess: null,
        reservedSpawnToken: input.process.spawnToken,
        provenHandleLinkId: null
      }
    }
  }
  return { ...reserved, launchArgs: input.request.launchArgs ?? reserved.launchArgs }
}
