import { describe, expect, it } from 'vitest'
import {
  QUALITY_GATE_FEEDBACK_LOOP_OFF,
  normalizeQualityGateFeedbackLoopSettings,
  readQualityGateFeedbackLoopStatus,
  type QualityGateFeedbackLoopStatus
} from './quality-gate-feedback-loop'

describe('feedback loop settings of a repository', () => {
  it('is off unless the row says on, with three rounds', () => {
    expect(QUALITY_GATE_FEEDBACK_LOOP_OFF).toEqual({ enabled: false, maxRounds: 3 })
    for (const stored of [undefined, null, 'on', 1, [], {}, { enabled: 'true' }, { enabled: 1 }]) {
      expect(normalizeQualityGateFeedbackLoopSettings(stored)).toEqual({
        enabled: false,
        maxRounds: 3
      })
    }
    expect(normalizeQualityGateFeedbackLoopSettings({ enabled: true })).toEqual({
      enabled: true,
      maxRounds: 3
    })
  })

  it('keeps the round limit within bounds', () => {
    const rounds = (maxRounds: unknown): number =>
      normalizeQualityGateFeedbackLoopSettings({ enabled: true, maxRounds }).maxRounds
    expect(rounds(5)).toBe(5)
    expect(rounds(2.6)).toBe(3)
    expect(rounds(0)).toBe(1)
    expect(rounds(-4)).toBe(1)
    expect(rounds(500)).toBe(10)
    expect(rounds('7')).toBe(3)
    expect(rounds(Number.NaN)).toBe(3)
  })
})

describe('feedback loop status as a client reads it', () => {
  const status: QualityGateFeedbackLoopStatus = {
    enabled: true,
    repoEnabled: true,
    workspaceDisabled: false,
    maxRounds: 3,
    state: 'needs-user',
    round: 3,
    stopReason: 'round-limit',
    failingGateIds: ['lint']
  }

  it('reads what this build publishes', () => {
    expect(readQualityGateFeedbackLoopStatus(status)).toEqual(status)
    expect(readQualityGateFeedbackLoopStatus(JSON.parse(JSON.stringify(status)))).toEqual(status)
  })

  it('reads a state it does not know as no loop information', () => {
    expect(readQualityGateFeedbackLoopStatus({ ...status, state: 'paused' })).toBeNull()
    expect(readQualityGateFeedbackLoopStatus(undefined)).toBeNull()
    expect(readQualityGateFeedbackLoopStatus('checking')).toBeNull()
  })

  it('keeps a reason it does not know and fills what a host left out', () => {
    expect(
      readQualityGateFeedbackLoopStatus({ state: 'stopped', stopReason: 'host-restarted' })
    ).toEqual({
      enabled: false,
      repoEnabled: false,
      workspaceDisabled: false,
      maxRounds: 3,
      state: 'stopped',
      round: 0,
      stopReason: 'host-restarted',
      failingGateIds: []
    })
    expect(
      readQualityGateFeedbackLoopStatus({ state: 'idle', round: -1, failingGateIds: ['a', 2] })
    ).toMatchObject({ round: 0, failingGateIds: ['a'] })
  })
})
