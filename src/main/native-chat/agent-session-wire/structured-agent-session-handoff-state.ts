import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentSessionHandoffStatus } from '../../../shared/agent-session-wire'
import { idleStructuredHandoffStatus } from './structured-agent-session-handoff-status'
import type { StructuredTuiOwner } from './structured-agent-session-handoff-types'

export class StructuredAgentSessionHandoffState {
  private readonly statuses = new Map<string, AgentSessionHandoffStatus>()
  private readonly tuiOwners = new Map<string, StructuredTuiOwner>()

  constructor(
    private readonly deps: {
      requireRecord: (sessionId: string) => AgentSessionRecord
      publish: (sessionId: string, status: AgentSessionHandoffStatus) => void
      hostLabel?: string
    }
  ) {}

  status = (sessionId: string): AgentSessionHandoffStatus => {
    const value = this.statuses.get(sessionId)
    return value ?? idleStructuredHandoffStatus(this.deps.requireRecord(sessionId))
  }

  cachedStatus = (sessionId: string): AgentSessionHandoffStatus | undefined =>
    this.statuses.get(sessionId)

  owner = (sessionId: string): StructuredTuiOwner | undefined => this.tuiOwners.get(sessionId)

  retainOwner = (sessionId: string, owner: StructuredTuiOwner): void => {
    this.tuiOwners.set(sessionId, owner)
  }

  retainProvenOwner(sessionId: string, owner: StructuredTuiOwner): void {
    const record = this.deps.requireRecord(sessionId)
    if (
      record.lease.runtimeKind !== 'tui' ||
      record.lease.claimStatus !== 'live' ||
      record.lease.ownerProcess?.spawnToken !== owner.process.spawnToken ||
      record.lease.ownerProcess.pid !== owner.process.pid ||
      record.lease.ownerProcess.processStartTimeMs !== owner.process.processStartTimeMs ||
      record.lease.provenHandleLinkId !== owner.link.linkId
    ) {
      throw new Error('agent_session_ownership_unknown')
    }
    this.retainOwner(sessionId, owner)
    this.setStatus(sessionId, {
      owner: 'tui',
      direction: null,
      phase: 'idle',
      stage: null,
      operationId: null,
      terminal: owner.terminal,
      hostLabel: this.deps.hostLabel
    })
  }

  releaseOwner = (sessionId: string): void => void this.tuiOwners.delete(sessionId)

  setStatus = (sessionId: string, status: AgentSessionHandoffStatus): void => {
    this.statuses.set(sessionId, status)
    this.deps.publish(sessionId, status)
  }
}
