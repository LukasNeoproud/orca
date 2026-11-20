/**
 * The feedback loop of quality gates: after an agent finishes a step, the owning host runs the
 * required gates and sends what failed back to that agent. Off unless the repository turns it on,
 * because it sends messages nobody typed and they cost tokens.
 */

export const QUALITY_GATE_FEEDBACK_LOOP_LIMITS = {
  minRounds: 1,
  maxRounds: 10,
  defaultRounds: 3
} as const

/** Stored on the repository row. Written by the app's own window only, like the gates. */
export type QualityGateFeedbackLoopSettings = {
  enabled: boolean
  /** How many times one chain may send the failures back before they are left to the user. */
  maxRounds: number
}

export const QUALITY_GATE_FEEDBACK_LOOP_OFF: QualityGateFeedbackLoopSettings = {
  enabled: false,
  maxRounds: QUALITY_GATE_FEEDBACK_LOOP_LIMITS.defaultRounds
}

/** Anything but an explicit `enabled: true` reads as off: a row from another build never turns it on. */
export function normalizeQualityGateFeedbackLoopSettings(
  value: unknown
): QualityGateFeedbackLoopSettings {
  if (!value || typeof value !== 'object') {
    return QUALITY_GATE_FEEDBACK_LOOP_OFF
  }
  const enabled = 'enabled' in value && value.enabled === true
  const rounds = 'maxRounds' in value ? value.maxRounds : undefined
  const { minRounds, maxRounds, defaultRounds } = QUALITY_GATE_FEEDBACK_LOOP_LIMITS
  return {
    enabled,
    maxRounds:
      typeof rounds === 'number' && Number.isFinite(rounds)
        ? Math.min(maxRounds, Math.max(minRounds, Math.round(rounds)))
        : defaultRounds
  }
}

/**
 * - `idle`: no agent step has been checked since this host started.
 * - `checking`: the required gates are running for a finished step.
 * - `awaiting-agent`: the failures were sent and the agent has not finished its next step.
 * - `passed`: the last check found every required gate passing.
 * - `needs-user`: failures are left to the user; the agent gets no further message.
 * - `stopped`: the chain ended without a verdict on the code.
 */
export const QUALITY_GATE_FEEDBACK_LOOP_STATES = [
  'idle',
  'checking',
  'awaiting-agent',
  'passed',
  'needs-user',
  'stopped'
] as const
export type QualityGateFeedbackLoopState = (typeof QUALITY_GATE_FEEDBACK_LOOP_STATES)[number]

/** Why the chain is in `needs-user` or `stopped`. Open: a reader shows an unknown reason as none. */
export type QualityGateFeedbackLoopStopReason =
  | 'round-limit'
  | 'no-improvement'
  /** The agent could not be sent a message: no reachable terminal or chat, or it was not idle. */
  | 'not-deliverable'
  /** Somebody typed into the agent's terminal, so nothing is pasted over it. */
  | 'user-input'
  | 'user-message'
  | 'agent-interrupted'
  | 'agent-gone'
  | 'disabled'
  /** A gate was stopped, never started or its end was not observed: no verdict to act on. */
  | 'gates-inconclusive'
  /** The host refused to start the gates, as in a review worktree whose review is static. */
  | 'run-refused'

export type QualityGateFeedbackLoopStatus = {
  /** Whether a finished agent step is checked: on for the repository and not off for the workspace. */
  enabled: boolean
  repoEnabled: boolean
  workspaceDisabled: boolean
  maxRounds: number
  state: QualityGateFeedbackLoopState
  /** Messages sent to the agent in the current chain. */
  round: number
  stopReason?: QualityGateFeedbackLoopStopReason | (string & {})
  /** Required gates the last check found failing. */
  failingGateIds: string[]
}

export type QualityGateSetFeedbackLoopResult = {
  feedbackLoop: QualityGateFeedbackLoopStatus
}

const STATES: ReadonlySet<string> = new Set(QUALITY_GATE_FEEDBACK_LOOP_STATES)

function isLoopState(value: unknown): value is QualityGateFeedbackLoopState {
  return typeof value === 'string' && STATES.has(value)
}

/**
 * Null for a host from before the loop, and for a state this build does not know: both read as
 * "no loop information", never as an error on the gate status that carries the field.
 */
export function readQualityGateFeedbackLoopStatus(
  value: unknown
): QualityGateFeedbackLoopStatus | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const fields: Record<string, unknown> = { ...value }
  const { state, stopReason, failingGateIds } = fields
  if (!isLoopState(state)) {
    return null
  }
  const count = (raw: unknown, fallback: number): number =>
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : fallback
  return {
    enabled: fields.enabled === true,
    repoEnabled: fields.repoEnabled === true,
    workspaceDisabled: fields.workspaceDisabled === true,
    maxRounds: count(fields.maxRounds, QUALITY_GATE_FEEDBACK_LOOP_LIMITS.defaultRounds),
    state,
    round: count(fields.round, 0),
    ...(typeof stopReason === 'string' && stopReason ? { stopReason } : {}),
    failingGateIds: Array.isArray(failingGateIds)
      ? failingGateIds.filter((id): id is string => typeof id === 'string')
      : []
  }
}
