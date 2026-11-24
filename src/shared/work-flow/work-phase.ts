/**
 * Where a unit of work stands between its first commit and a released build, derived from the
 * facts its sources reported. A fact that is unknown makes the phase unknown: the remaining facts
 * never stand in for it.
 */

import type { WorkFact, WorkFactUnknownReason } from './work-fact'
import type { WorkBranch, WorkPullRequest, WorkRelease } from './work-unit-facts'

/**
 * - `no-pull-request`: the branch has commits of its own and no open or merged pull request.
 * - `draft`: the pull request is a draft, so nobody is asked to review it yet.
 * - `waiting-for-review`: it is the reviewers' turn.
 * - `changes-requested`: reviewers left feedback and the author has pushed nothing since.
 * - `approved`: approved and not merged.
 * - `merged-unreleased`: merged, and no production tag holds the merge commit.
 * - `merged`: merged in a repository that does not track production tags; the end of the work.
 * - `released`: a production tag holds the merge commit.
 */
export const WORK_PHASES = [
  'no-pull-request',
  'draft',
  'waiting-for-review',
  'changes-requested',
  'approved',
  'merged-unreleased',
  'merged',
  'released'
] as const
export type WorkPhase = (typeof WORK_PHASES)[number]

/** Phases in which work can be forgotten, each with a deadline in the settings. */
export const WORK_DEADLINE_PHASES = [
  'no-pull-request',
  'waiting-for-review',
  'changes-requested',
  'merged-unreleased'
] as const satisfies readonly WorkPhase[]
export type WorkDeadlinePhase = (typeof WORK_DEADLINE_PHASES)[number]

export function isWorkDeadlinePhase(phase: WorkPhase): phase is WorkDeadlinePhase {
  return WORK_DEADLINE_PHASES.some((candidate) => candidate === phase)
}

/** The fact whose absence keeps the phase unknown. */
export type WorkPhaseMissingFact = 'branch' | 'pull-request' | 'review' | 'merge-commit' | 'release'

export type WorkNotWorkReason =
  | 'no-own-commits'
  | 'pull-request-closed'
  | 'pull-request-of-someone-else'

export type WorkPhaseVerdict =
  /**
   * `since` is when the phase began. With `sinceExact` false it is the latest moment it can have
   * begun (the pull request's last activity), so the unit has been in the phase at least that long.
   */
  | { kind: 'phase'; phase: WorkPhase; since: string | null; sinceExact: boolean }
  | { kind: 'unknown'; missing: WorkPhaseMissingFact; reason: WorkFactUnknownReason }
  /** Not a unit of work of the user; a composer drops it. */
  | { kind: 'not-work'; reason: WorkNotWorkReason }

export type WorkPhaseFacts = {
  /** Null for a pull request whose branch has no workspace. */
  branch: WorkFact<WorkBranch> | null
  /** A known null is a branch without a pull request. */
  pullRequest: WorkFact<WorkPullRequest | null>
  release: WorkRelease
}

function timeOf(value: string | null): number | null {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? null : time
}

function phaseSince(
  phase: WorkPhase,
  exact: string | null,
  latestPossible: string | null
): WorkPhaseVerdict {
  if (timeOf(exact) !== null) {
    return { kind: 'phase', phase, since: exact, sinceExact: true }
  }
  const since = timeOf(latestPossible) === null ? null : latestPossible
  return { kind: 'phase', phase, since, sinceExact: false }
}

function unknownPhase(
  missing: WorkPhaseMissingFact,
  reason: WorkFactUnknownReason
): WorkPhaseVerdict {
  return { kind: 'unknown', missing, reason }
}

function openPullRequestPhase(pullRequest: WorkPullRequest): WorkPhaseVerdict {
  if (!pullRequest.review.known) {
    return unknownPhase('review', pullRequest.review.reason)
  }
  const review = pullRequest.review.value
  const feedbackWaits =
    review.verdict === 'changes-requested' || (review.unresolvedThreads ?? 0) > 0
  const version = timeOf(pullRequest.lastVersionAt)
  const feedback = timeOf(review.lastFeedbackAt)
  // Without both times the provider's standing verdict decides: nothing proves a newer version.
  const pushedSinceFeedback = version !== null && feedback !== null && version > feedback
  if (feedbackWaits && !pushedSinceFeedback) {
    return phaseSince('changes-requested', review.lastFeedbackAt, pullRequest.updatedAt)
  }
  if (review.verdict === 'approved') {
    return phaseSince('approved', null, pullRequest.updatedAt)
  }
  // The reviewers' turn began with the last version, or with their later comment that is settled.
  const reviewersTurn =
    version !== null && feedback !== null && feedback > version
      ? review.lastFeedbackAt
      : pullRequest.lastVersionAt
  return phaseSince('waiting-for-review', reviewersTurn, pullRequest.updatedAt)
}

function mergedPullRequestPhase(
  pullRequest: WorkPullRequest,
  release: WorkRelease
): WorkPhaseVerdict {
  const production = release.production
  if (production.state === 'off') {
    return phaseSince('merged', pullRequest.mergedAt, pullRequest.updatedAt)
  }
  if (production.state === 'released') {
    return phaseSince('released', production.taggedAt, null)
  }
  // No tag can be checked against a merge whose commit the provider did not name.
  if (!pullRequest.mergeCommit) {
    return unknownPhase('merge-commit', 'not-provided')
  }
  if (production.state === 'unknown') {
    return unknownPhase('release', production.reason)
  }
  return phaseSince('merged-unreleased', pullRequest.mergedAt, pullRequest.updatedAt)
}

function branchPhase(
  branch: WorkFact<WorkBranch> | null,
  hasClosedPullRequest: boolean
): WorkPhaseVerdict {
  if (branch && !branch.known) {
    return unknownPhase('branch', branch.reason)
  }
  if (!branch || branch.value.ownCommitCount <= 0) {
    return {
      kind: 'not-work',
      reason: hasClosedPullRequest ? 'pull-request-closed' : 'no-own-commits'
    }
  }
  return phaseSince('no-pull-request', branch.value.lastCommitAt, null)
}

export function deriveWorkPhase(facts: WorkPhaseFacts): WorkPhaseVerdict {
  if (!facts.pullRequest.known) {
    return unknownPhase('pull-request', facts.pullRequest.reason)
  }
  const pullRequest = facts.pullRequest.value
  if (!pullRequest) {
    return branchPhase(facts.branch, false)
  }
  if (pullRequest.createdByUser === false) {
    return { kind: 'not-work', reason: 'pull-request-of-someone-else' }
  }
  switch (pullRequest.state) {
    case 'draft':
      return phaseSince('draft', null, pullRequest.updatedAt)
    case 'open':
      return openPullRequestPhase(pullRequest)
    case 'merged':
      return mergedPullRequestPhase(pullRequest, facts.release)
    case 'closed':
      // An abandoned pull request leaves the branch where it was before one existed.
      return branchPhase(facts.branch, true)
  }
}
