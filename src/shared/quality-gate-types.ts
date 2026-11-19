/**
 * Quality gates: commands the user sets up per repository in Orca (lint, build, tests) and the
 * record of each time the owning host ran one. Kept free of `node:` imports for the web build.
 */

import type { QualityGateFeedbackLoopStatus } from './quality-gate-feedback-loop'

export const QUALITY_GATE_LIMITS = {
  maxGates: 20,
  maxNameLength: 80,
  maxCommandLength: 4000,
  minTimeoutSeconds: 5,
  maxTimeoutSeconds: 4 * 60 * 60,
  defaultTimeoutSeconds: 600
} as const

/** Tail kept from each of stdout and stderr; the head of a long build log is rarely the failure. */
export const QUALITY_GATE_OUTPUT_TAIL_BYTES = 16 * 1024

export type QualityGateDefinition = {
  id: string
  name: string
  /** Free text the user typed in Orca. Never read from the repository. */
  command: string
  /** A required gate must pass before the work counts as ready; an optional one only informs. */
  required: boolean
  timeoutSeconds: number
}

const GATE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function normalizeTimeoutSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return QUALITY_GATE_LIMITS.defaultTimeoutSeconds
  }
  return Math.min(
    QUALITY_GATE_LIMITS.maxTimeoutSeconds,
    Math.max(QUALITY_GATE_LIMITS.minTimeoutSeconds, Math.round(value))
  )
}

/** A stored gate entry before any of its fields is checked. */
type UncheckedQualityGateDefinition = { [K in keyof QualityGateDefinition]?: unknown }

function normalizeQualityGateDefinition(value: unknown): QualityGateDefinition | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const unchecked: UncheckedQualityGateDefinition = value
  const rawId = unchecked.id
  const rawName = unchecked.name
  const rawCommand = unchecked.command
  const id = typeof rawId === 'string' ? rawId : ''
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  const command = typeof rawCommand === 'string' ? rawCommand.trim() : ''
  if (
    !GATE_ID_PATTERN.test(id) ||
    !name ||
    name.length > QUALITY_GATE_LIMITS.maxNameLength ||
    !command ||
    command.length > QUALITY_GATE_LIMITS.maxCommandLength ||
    // A NUL cannot reach a shell intact on any platform.
    command.includes('\0')
  ) {
    return null
  }
  return {
    id,
    name,
    command,
    required: unchecked.required !== false,
    timeoutSeconds: normalizeTimeoutSeconds(unchecked.timeoutSeconds)
  }
}

/**
 * The gates worth storing from an untrusted value. `undefined` means the value was not a list at
 * all, so a writer keeps what it has; a malformed entry is dropped rather than repaired.
 */
export function normalizeQualityGateDefinitions(
  value: unknown
): QualityGateDefinition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const gates: QualityGateDefinition[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const gate = normalizeQualityGateDefinition(entry)
    if (!gate || seen.has(gate.id)) {
      continue
    }
    seen.add(gate.id)
    gates.push(gate)
    if (gates.length === QUALITY_GATE_LIMITS.maxGates) {
      break
    }
  }
  return gates
}

/** Whether a repository row carries at least one usable gate. */
export function hasQualityGateDefinitions(value: unknown): boolean {
  return (normalizeQualityGateDefinitions(value)?.length ?? 0) > 0
}

/**
 * `queued` and `running` are live on the host that owns the run. The rest are final, except
 * `unverifiable`: nobody who can still be asked knows whether the command is running.
 */
export type QualityGateRunStatus =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'timed-out'
  | 'not-started'
  | 'cancelled'
  | 'unverifiable'

export type QualityGateRunLiveness = 'live' | 'unverifiable' | 'exited'

export function qualityGateRunLiveness(status: QualityGateRunStatus): QualityGateRunLiveness {
  if (status === 'queued' || status === 'running') {
    return 'live'
  }
  return status === 'unverifiable' ? 'unverifiable' : 'exited'
}

/** Whether the command ran to a verdict. A stopped or never started run says nothing about the code. */
export function qualityGateRunHasResult(status: QualityGateRunStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'timed-out'
}

/** Why a `cancelled` run was stopped. Absent on records written before the field existed. */
export type QualityGateStopReason = 'requested' | 'app-quit'

/** What the worktree held when the command started. */
export type QualityGateSourceState = {
  /** Commit checked out; null when the workspace has no git. */
  head: string | null
  /** Whether nothing differed from that commit; null when unknown or without git. */
  clean: boolean | null
  /** Digest of the uncommitted state, to notice a later edit; null when it could not be read. */
  fingerprint: string | null
}

export const QUALITY_GATE_UNLINKED_SOURCE: QualityGateSourceState = {
  head: null,
  clean: null,
  fingerprint: null
}

/** Who asked for the run, as the host's transport established it. */
export type QualityGateRunStarter =
  | { kind: 'desktop' }
  | { kind: 'local-cli' }
  | { kind: 'paired-device'; deviceId: string }
  /** The host itself, after an agent finished a step with the feedback loop on. */
  | { kind: 'feedback-loop' }

export type QualityGateRun = {
  id: string
  gateId: string
  /** The definition as it ran, so a later edit in settings cannot rewrite what was checked. */
  gate: Omit<QualityGateDefinition, 'id'>
  repoId: string
  worktreeId: string
  worktreePath: string
  startedBy: QualityGateRunStarter
  /** Null until the command starts: a queued run has not looked at the tree yet. */
  source: QualityGateSourceState | null
  status: QualityGateRunStatus
  requestedAt: number
  startedAt: number | null
  finishedAt: number | null
  exitCode: number | null
  /** Why the command never started, or why its end was not observed. */
  error: string | null
  outputTruncated: boolean
  /** Optional so a record from an older host stays valid; readers fall back to `error`. */
  stopReason?: QualityGateStopReason
}

export type QualityGateFreshnessReason = 'head-changed' | 'tree-changed' | 'gate-changed'

export type QualityGateFreshness =
  | { state: 'current' }
  | { state: 'stale'; reasons: QualityGateFreshnessReason[] }
  /** No git behind the workspace, so the result is tied to no commit. */
  | { state: 'unlinked' }
  /** The tree could not be read, then or now. */
  | { state: 'unknown' }

/**
 * Whether a finished run still describes the worktree. Conservative on purpose: anything that
 * changed after the command started makes the result stale, including an edit the gate made.
 */
export function deriveQualityGateFreshness(
  run: Pick<QualityGateRun, 'gate' | 'source'>,
  current: QualityGateSourceState,
  definition: Pick<QualityGateDefinition, 'command'> | null
): QualityGateFreshness {
  const reasons: QualityGateFreshnessReason[] = []
  const ran = run.source
  if (ran && ran.head !== current.head) {
    reasons.push('head-changed')
  }
  if (
    ran &&
    ran.fingerprint !== null &&
    current.fingerprint !== null &&
    ran.fingerprint !== current.fingerprint
  ) {
    reasons.push('tree-changed')
  }
  if (!definition || definition.command !== run.gate.command) {
    reasons.push('gate-changed')
  }
  if (reasons.length > 0) {
    return { state: 'stale', reasons }
  }
  if (!ran) {
    return { state: 'unknown' }
  }
  if (ran.head === null) {
    return { state: 'unlinked' }
  }
  return ran.fingerprint === null || current.fingerprint === null
    ? { state: 'unknown' }
    : { state: 'current' }
}

export type QualityGateRunView = QualityGateRun & {
  liveness: QualityGateRunLiveness
  /** Null unless the run has a result: a live, stopped or unobserved run has nothing to be stale. */
  freshness: QualityGateFreshness | null
}

export type QualityGateListResult = {
  repoId: string
  worktreeId: string
  gates: QualityGateDefinition[]
}

export type QualityGateStatusResult = {
  repoId: string
  worktreeId: string
  worktreePath: string
  /** The worktree as it is now. */
  source: QualityGateSourceState
  gates: { gate: QualityGateDefinition; latestRun: QualityGateRunView | null }[]
  /** Absent from a host that predates the loop; read it with `readQualityGateFeedbackLoopStatus`. */
  feedbackLoop?: QualityGateFeedbackLoopStatus
}

export type QualityGateRunStartResult = {
  /** `started: false` returns the run already live for that gate instead of a second one. */
  runs: { run: QualityGateRunView; started: boolean }[]
}

export type QualityGateRunOutput = {
  run: QualityGateRunView
  stdout: string
  stderr: string
}

export type QualityGateCancelResult = {
  cancelled: QualityGateRunView[]
}
