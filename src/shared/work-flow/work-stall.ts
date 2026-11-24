/** Whether a unit of work has stayed in its phase past the deadline the user set for it. */

import type { WorkFlowSettings } from './work-flow-settings'
import { isWorkDeadlinePhase, type WorkPhaseVerdict } from './work-phase'
import { addWorkingDays, systemWallClockOffset, type WallClockOffset } from './working-day-deadline'

export type WorkStall =
  /** The phase has no deadline: nothing waits on anyone, or the work is over. */
  | { kind: 'none' }
  /**
   * `exact` false means the phase began no later than assumed, so the true deadline is no later
   * than `deadlineAt`: `stalled` is certain, `within` is the best the provider's facts allow.
   */
  | { kind: 'within' | 'stalled'; workingDays: number; deadlineAt: string; exact: boolean }
  /** The phase or its start is unknown; never counted as stalled and never as fine. */
  | { kind: 'unknown' }

export function deriveWorkStall(
  verdict: WorkPhaseVerdict,
  settings: WorkFlowSettings,
  nowMs: number,
  offset: WallClockOffset = systemWallClockOffset
): WorkStall {
  if (verdict.kind !== 'phase') {
    return { kind: 'unknown' }
  }
  if (!isWorkDeadlinePhase(verdict.phase)) {
    return { kind: 'none' }
  }
  const since = verdict.since ? Date.parse(verdict.since) : Number.NaN
  if (Number.isNaN(since)) {
    return { kind: 'unknown' }
  }
  const workingDays = settings.deadlineWorkingDays[verdict.phase]
  const deadline = addWorkingDays(since, workingDays, offset)
  return {
    kind: nowMs >= deadline ? 'stalled' : 'within',
    workingDays,
    deadlineAt: new Date(deadline).toISOString(),
    exact: verdict.sinceExact
  }
}
