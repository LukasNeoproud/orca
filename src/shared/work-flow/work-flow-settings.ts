/**
 * App settings of the work flow: after how many working days a phase counts as stalled, and for
 * which phases a stalled unit raises a desktop notification. Stored as `workFlow` in the settings
 * of the app the user sits at.
 */

import { WORK_DEADLINE_PHASES, type WorkDeadlinePhase } from './work-phase'

export const WORK_DEADLINE_LIMITS = { minWorkingDays: 1, maxWorkingDays: 60 } as const

export type WorkFlowSettings = {
  deadlineWorkingDays: Record<WorkDeadlinePhase, number>
  notifyWhenStalled: Record<WorkDeadlinePhase, boolean>
}

export const DEFAULT_WORK_FLOW_SETTINGS: WorkFlowSettings = {
  deadlineWorkingDays: {
    'no-pull-request': 1,
    'waiting-for-review': 2,
    'changes-requested': 1,
    'merged-unreleased': 3
  },
  notifyWhenStalled: {
    'no-pull-request': true,
    'waiting-for-review': true,
    'changes-requested': true,
    'merged-unreleased': true
  }
}

/** Stored settings before any field is checked. */
type UncheckedWorkFlowSettings = { [K in keyof WorkFlowSettings]?: unknown }
type UncheckedByPhase = Partial<Record<WorkDeadlinePhase, unknown>>

function byPhase(value: unknown): UncheckedByPhase {
  return value && typeof value === 'object' ? value : {}
}

function isDeadlineWorkingDays(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= WORK_DEADLINE_LIMITS.minWorkingDays &&
    value <= WORK_DEADLINE_LIMITS.maxWorkingDays
  )
}

/** Settings as any build stored them: a missing or invalid value reads as its default. */
export function readWorkFlowSettings(value: unknown): WorkFlowSettings {
  const stored: UncheckedWorkFlowSettings = value && typeof value === 'object' ? value : {}
  const deadlines = byPhase(stored.deadlineWorkingDays)
  const notify = byPhase(stored.notifyWhenStalled)
  const settings: WorkFlowSettings = {
    deadlineWorkingDays: { ...DEFAULT_WORK_FLOW_SETTINGS.deadlineWorkingDays },
    notifyWhenStalled: { ...DEFAULT_WORK_FLOW_SETTINGS.notifyWhenStalled }
  }
  for (const phase of WORK_DEADLINE_PHASES) {
    const days = deadlines[phase]
    if (isDeadlineWorkingDays(days)) {
      settings.deadlineWorkingDays[phase] = days
    }
    // Only an explicit false turns a notification off.
    settings.notifyWhenStalled[phase] = notify[phase] !== false
  }
  return settings
}
