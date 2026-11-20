// Evidence that points at a command an Orca host ran itself and recorded: the author names the
// run, the host reads its own record. Nothing the author sends says how the command ended.

import type { QualityGateRunStatus } from './quality-gate-types'

export const REVIEW_COMMAND_RUN_KIND = 'command-run'

/** Where the host keeps the record. A new source is a new value here, not a new kind. */
export const REVIEW_COMMAND_RUN_SOURCES = ['quality-gate'] as const
export type ReviewCommandRunSource = (typeof REVIEW_COMMAND_RUN_SOURCES)[number]

export const REVIEW_COMMAND_RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** A claim that the named run failed on the commit of the finding. */
export type ReviewCommandRunEvidence = {
  kind: typeof REVIEW_COMMAND_RUN_KIND
  source: ReviewCommandRunSource
  runId: string
  /** What the failure shows, in the author's words. */
  note?: string
}

export function isReviewCommandRunSource(value: unknown): value is ReviewCommandRunSource {
  return REVIEW_COMMAND_RUN_SOURCES.some((source) => source === value)
}

/** False for a source only a newer build knows: such evidence is kept and never trusted. */
export function isReviewCommandRunEvidence(evidence: {
  kind: string
  [field: string]: unknown
}): evidence is ReviewCommandRunEvidence {
  return (
    evidence.kind === REVIEW_COMMAND_RUN_KIND &&
    isReviewCommandRunSource(evidence.source) &&
    typeof evidence.runId === 'string' &&
    REVIEW_COMMAND_RUN_ID_PATTERN.test(evidence.runId) &&
    (evidence.note === undefined || typeof evidence.note === 'string')
  )
}

/**
 * The run as the host recorded it, for whoever shows the check. Carries no output: that is read
 * from the host that owns the worktree (`qualityGates.output`) and is data, never instructions.
 */
export type ReviewCommandRunSummary = {
  source: ReviewCommandRunSource
  runId: string
  /** The workspace the command ran in, as `qualityGates.output` names it. */
  worktreeId: string
  /** Name and command as they ran. */
  name: string
  command: string
  status: QualityGateRunStatus
  exitCode: number | null
  /** Commit checked out when the command started; null without git. */
  commit: string | null
  /** Whether nothing differed from that commit; null when the host could not tell. */
  cleanTree: boolean | null
  finishedAt: number | null
  outputTruncated: boolean
}

/** Why a run that the host looked for proves nothing. */
export type ReviewCommandRunUncheckedReason =
  /** This host keeps no such record: never existed, pruned, or kept by another host. */
  | 'run-not-found'
  /** The host that answered has no run records to look in. */
  | 'runs-unavailable'
  /** The run is not from the review worktree of this pull request. */
  | 'run-other-worktree'
  /** The gate is no longer in the repository's settings with the command that ran. */
  | 'run-gate-changed'
  /** The run is from an older iteration than the one the finding now stands on. */
  | 'run-stale-commit'
  | 'run-other-commit'
  /** Files differed from the commit, so the run did not test the commit. */
  | 'run-dirty-tree'
  | 'run-not-finished'
  /** Stopped, timed out, never started or unobserved: no verdict on the code. */
  | 'run-no-verdict'
  /** The command succeeded, so it does not show the failure the finding claims. */
  | 'run-passed'
