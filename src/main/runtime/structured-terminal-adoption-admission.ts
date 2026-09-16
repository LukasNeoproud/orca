import type { AgentSessionProcessIdentity } from '../../shared/agent-session-record'
import { agentSessionExecutionLocationsEqual } from '../../shared/agent-session-record'
import { nextAgentSessionFence } from '../../shared/agent-session-next-fence'
import type { StructuredTerminalAdoptionContext } from './structured-terminal-adoption'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import { agentSessionPtyWriteGate } from './agent-session-pty-write-gate'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'

import {
  sameTerminalProcess,
  type TerminalAdoptionExistingOwner,
  type TerminalAdoptionPreviousOwner
} from './agent-session-terminal-owner-readoption'

export function planStructuredTerminalAdoption(input: {
  context: StructuredTerminalAdoptionContext
  pty: RuntimePtyWorktreeRecord
  process: AgentSessionProcessIdentity
  agent: 'codex' | 'claude'
  providerSessionId: string
  accountHomePath: string
}): {
  existing?: TerminalAdoptionExistingOwner
  previous?: TerminalAdoptionPreviousOwner
  fence: number
} {
  const { context, pty } = input
  const records = context.host.deps.store.listRecords()
  const matches = records.filter((record) => {
    const handle = record.providerHandleChain.at(-1)?.handle
    return (
      handle?.provider === input.agent &&
      (handle.provider === 'codex' ? handle.threadId : handle.sessionId) === input.providerSessionId
    )
  })
  if (matches.length > 1) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'Multiple structured records claim this conversation.'
    )
  }
  const existing = matches[0]
  if (
    existing &&
    (!agentSessionExecutionLocationsEqual(existing.location, context.location) ||
      existing.accountHome.path !== input.accountHomePath)
  ) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'This conversation belongs to a different workspace or account.'
    )
  }
  const boundId = agentSessionPtyWriteGate.boundSessionId(pty.ptyId)
  const previousOwners = records.filter(
    (record) =>
      record.sessionId !== existing?.sessionId &&
      sameTerminalProcess(record.lease.ownerProcess, input.process)
  )
  if (previousOwners.length > 1) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'Multiple structured records claim this terminal process.'
    )
  }
  const previous =
    boundId && boundId !== existing?.sessionId
      ? context.host.deps.store.getRecord(boundId)
      : previousOwners[0]
  if (
    (previous || (boundId && boundId !== existing?.sessionId)) &&
    (!previous ||
      previous.lease.runtimeKind !== 'tui' ||
      previous.lease.claimStatus !== 'live' ||
      previous.lease.handoffStage !== null ||
      previous.lease.unreconciled ||
      !agentSessionExecutionLocationsEqual(previous.location, context.location) ||
      previous.provider !== input.agent ||
      previous.accountHome.path !== input.accountHomePath ||
      previous.lease.settlementRetryRequired ||
      !sameTerminalProcess(previous.lease.ownerProcess, input.process))
  ) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'This terminal is still owned by another structured session transfer.'
    )
  }
  const detached = previous
    ? { previous: { sessionId: previous.sessionId, fence: previous.lease.runtimeFence } }
    : {}
  if (!existing) {
    return { ...detached, fence: 1 }
  }
  const lease = existing.lease
  let mode: TerminalAdoptionExistingOwner['mode'] | null = null
  if (!lease.unreconciled && !lease.settlementRetryRequired) {
    if (
      lease.runtimeKind === 'tui' &&
      lease.claimStatus === 'live' &&
      [null, 'recovering', 'manual-recovery'].includes(lease.handoffStage) &&
      sameTerminalProcess(lease.ownerProcess, input.process)
    ) {
      mode = 'live'
      input.process.spawnToken = lease.ownerProcess!.spawnToken
    } else if (
      lease.claimStatus === 'released' &&
      lease.handoffStage === null &&
      lease.ownerProcess === null &&
      lease.reservedSpawnToken === null
    ) {
      mode = 'released'
    } else if (
      lease.runtimeKind === 'tui' &&
      lease.claimStatus === 'reserved' &&
      ['recovering', 'manual-recovery'].includes(lease.handoffStage ?? '') &&
      lease.ownerProcess === null &&
      lease.reservedSpawnToken !== null &&
      pty.launchToken === lease.reservedSpawnToken
    ) {
      mode = 'reserved'
      input.process.spawnToken = lease.reservedSpawnToken
    }
  }
  if (!mode) {
    throw new StructuredTerminalAdoptionError(
      lease.ownerProcess ? 'agent_session_conflict' : 'agent_session_ownership_unknown',
      lease.ownerProcess
        ? 'This conversation still has another structured owner. Its exit must be verified before attaching this terminal.'
        : 'An earlier terminal transfer has no verified owner yet. Its failed launch must be recovered before attaching another terminal.',
      existing.sessionId
    )
  }
  return {
    ...detached,
    existing: { sessionId: existing.sessionId, fence: lease.runtimeFence, mode },
    fence: mode === 'released' ? nextAgentSessionFence(lease) : lease.runtimeFence
  }
}
