import { describe, expect, it } from 'vitest'
import { DEFAULT_WORK_FLOW_SETTINGS, readWorkFlowSettings } from './work-flow-settings'
import type { WorkPhase, WorkPhaseVerdict } from './work-phase'
import { deriveWorkStall } from './work-stall'
import { addWorkingDays, isWorkingDay, type WallClockOffset } from './working-day-deadline'

// Central European winter time, so the tests do not depend on the zone of the machine.
const CET: WallClockOffset = () => 60
/** A CET wall-clock time in November 2026; the 20th is a Friday. */
const cet = (day: number, hour: number, minute = 0): number =>
  Date.UTC(2026, 10, day, hour - 1, minute)

describe('working-day deadlines', () => {
  it('lands at the same time of day on the next working day', () => {
    expect(addWorkingDays(cet(17, 10, 30), 1, CET)).toBe(cet(18, 10, 30))
    expect(addWorkingDays(cet(17, 10, 30), 3, CET)).toBe(cet(20, 10, 30))
  })

  it('skips the weekend', () => {
    expect(addWorkingDays(cet(20, 16), 1, CET)).toBe(cet(23, 16))
    expect(addWorkingDays(cet(19, 16), 2, CET)).toBe(cet(23, 16))
    expect(addWorkingDays(cet(19, 16), 3, CET)).toBe(cet(24, 16))
  })

  it('counts a start on the weekend from Monday midnight', () => {
    expect(addWorkingDays(cet(21, 10), 1, CET)).toBe(cet(24, 0))
    expect(addWorkingDays(cet(22, 23, 59), 2, CET)).toBe(cet(25, 0))
  })

  it('decides the weekend by the wall clock, not by UTC', () => {
    // Saturday 00:30 CET is still Friday in UTC.
    expect(isWorkingDay(cet(21, 0, 30), CET)).toBe(false)
    expect(isWorkingDay(cet(21, 0, 30), () => 0)).toBe(true)
    expect(addWorkingDays(cet(21, 0, 30), 1, CET)).toBe(cet(24, 0))
  })

  it('keeps the time of day across a change of the clock', () => {
    // Summer time ends on Sunday 2026-10-25 at 01:00 UTC.
    const summerTimeEnds = Date.UTC(2026, 9, 25, 1)
    const offset: WallClockOffset = (epochMs) => (epochMs < summerTimeEnds ? 120 : 60)
    const fridayAfternoon = Date.UTC(2026, 9, 23, 14) // 16:00 summer time
    expect(addWorkingDays(fridayAfternoon, 1, offset)).toBe(Date.UTC(2026, 9, 26, 15)) // 16:00
  })
})

function inPhase(phase: WorkPhase, since: number | null, sinceExact = true): WorkPhaseVerdict {
  return {
    kind: 'phase',
    phase,
    since: since === null ? null : new Date(since).toISOString(),
    sinceExact
  }
}

describe('stall of a unit of work', () => {
  const stall = (verdict: WorkPhaseVerdict, nowMs: number, settings = DEFAULT_WORK_FLOW_SETTINGS) =>
    deriveWorkStall(verdict, settings, nowMs, CET)

  it('uses the default deadlines of 1, 2, 1 and 3 working days', () => {
    const monday = cet(16, 9)
    const expected = [
      ['no-pull-request', 1, cet(17, 9)],
      ['waiting-for-review', 2, cet(18, 9)],
      ['changes-requested', 1, cet(17, 9)],
      ['merged-unreleased', 3, cet(19, 9)]
    ] as const
    for (const [phase, workingDays, deadline] of expected) {
      expect(stall(inPhase(phase, monday), deadline - 1)).toEqual({
        kind: 'within',
        workingDays,
        deadlineAt: new Date(deadline).toISOString(),
        exact: true
      })
      expect(stall(inPhase(phase, monday), deadline)).toMatchObject({
        kind: 'stalled',
        workingDays
      })
    }
  })

  it('does not stall over a weekend: a Friday commit is due on Monday', () => {
    const commit = inPhase('no-pull-request', cet(20, 16))
    expect(stall(commit, cet(22, 20))).toMatchObject({ kind: 'within' })
    expect(stall(commit, cet(23, 15, 59))).toMatchObject({ kind: 'within' })
    expect(stall(commit, cet(23, 16))).toMatchObject({ kind: 'stalled' })
  })

  it('carries a two and a three day deadline over the weekend', () => {
    const version = inPhase('waiting-for-review', cet(19, 11))
    expect(stall(version, cet(23, 10, 59))).toMatchObject({ kind: 'within' })
    expect(stall(version, cet(23, 11))).toMatchObject({ kind: 'stalled' })
    const merge = inPhase('merged-unreleased', cet(19, 11))
    expect(stall(merge, cet(23, 12))).toMatchObject({ kind: 'within' })
    expect(stall(merge, cet(24, 11))).toMatchObject({ kind: 'stalled' })
  })

  it('starts a new deadline when the phase changes', () => {
    const now = cet(19, 12)
    expect(stall(inPhase('no-pull-request', cet(17, 9)), now)).toMatchObject({ kind: 'stalled' })
    // The pull request was opened an hour ago: the same unit is no longer stalled.
    expect(stall(inPhase('waiting-for-review', cet(19, 11)), now)).toEqual({
      kind: 'within',
      workingDays: 2,
      deadlineAt: new Date(cet(23, 11)).toISOString(),
      exact: true
    })
  })

  it('follows the deadlines from the settings', () => {
    const settings = readWorkFlowSettings({ deadlineWorkingDays: { 'waiting-for-review': 5 } })
    const version = inPhase('waiting-for-review', cet(16, 9))
    expect(stall(version, cet(20, 9), settings)).toMatchObject({ kind: 'within', workingDays: 5 })
    expect(stall(version, cet(23, 9), settings)).toMatchObject({ kind: 'stalled' })
  })

  it('has no deadline where nothing waits on anyone', () => {
    for (const phase of ['draft', 'approved', 'merged', 'released'] as const) {
      expect(stall(inPhase(phase, cet(2, 9)), cet(24, 9))).toEqual({ kind: 'none' })
    }
  })

  it('is unknown, never stalled, for an unknown phase or an unknown start', () => {
    const now = cet(24, 9)
    expect(stall({ kind: 'unknown', missing: 'review', reason: 'not-provided' }, now)).toEqual({
      kind: 'unknown'
    })
    expect(stall(inPhase('changes-requested', null, false), now)).toEqual({ kind: 'unknown' })
    expect(
      stall({ kind: 'phase', phase: 'no-pull-request', since: 'soon', sinceExact: true }, now)
    ).toEqual({
      kind: 'unknown'
    })
  })

  it('marks a deadline counted from the last activity as not exact', () => {
    const blocked = inPhase('changes-requested', cet(16, 9), false)
    expect(stall(blocked, cet(18, 9))).toMatchObject({ kind: 'stalled', exact: false })
  })
})
