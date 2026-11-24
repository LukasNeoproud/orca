/**
 * What the sources report about a unit of work: git about its branch and its release, the review
 * provider about its pull request, the tracker about its ticket. Kept free of `node:` imports.
 */

import type { HostedReviewProvider, HostedReviewState } from '../hosted-review'
import type { WorkFact, WorkFactUnknownReason } from './work-fact'

/** Git facts of a branch that has a workspace, read by the host that leads the repository. */
export type WorkBranch = {
  /** Commits on the branch that its base branch does not have. */
  ownCommitCount: number
  /** Null when the branch has no commit of its own. */
  lastCommitAt: string | null
  /** Whether the remote has the branch; null when the host could not tell. */
  pushed: boolean | null
}

export type WorkReviewVote =
  | 'approved'
  | 'approved-with-suggestions'
  | 'waiting-for-author'
  | 'rejected'
  | 'none'

export type WorkReviewer = {
  name: string
  vote: WorkReviewVote
  /** A required reviewer who has not approved keeps the pull request from counting as approved. */
  required: boolean
}

export type WorkReviewVerdict = 'approved' | 'changes-requested' | 'none'

export type WorkReview = {
  /** What the reviewers' votes add up to now, as the provider holds them. */
  verdict: WorkReviewVerdict
  /** Empty when the provider reports the verdict only. */
  reviewers: WorkReviewer[]
  /** Open threads started by someone else; null when the provider does not count them. */
  unresolvedThreads: number | null
  /** Last comment or blocking vote by someone else; null when the provider does not say. */
  lastFeedbackAt: string | null
}

export type WorkPullRequest = {
  provider: HostedReviewProvider
  number: number
  title: string
  url: string
  state: HostedReviewState
  /** False keeps a colleague's branch checked out here from counting as the user's work. */
  createdByUser: boolean | null
  sourceBranch: string | null
  targetBranch: string | null
  /** Last activity of any kind: the latest moment the current phase can have begun. */
  updatedAt: string | null
  /** When the author last pushed; the creation time of a pull request with one version. */
  lastVersionAt: string | null
  review: WorkFact<WorkReview>
  mergedAt: string | null
  /** The commit the merge left on the target branch, also after a squash. */
  mergeCommit: string | null
}

export type WorkReleaseStage =
  /** The repository has no tag pattern for this stage. */
  | { state: 'off' }
  /** `tag` is the oldest matching tag that holds the merge commit. */
  | { state: 'released'; tag: string; taggedAt: string | null }
  /** The tags are current and none of them holds the merge commit. */
  | { state: 'unreleased' }
  | { state: 'unknown'; reason: WorkFactUnknownReason }

export type WorkRelease = {
  production: WorkReleaseStage
  dev: WorkReleaseStage
}

export type WorkTicket = {
  title: string
  status: string
  /** The tracker's own grouping of the status (to do, in progress, done), when it has one. */
  statusCategory: string | null
  type: string | null
  assignee: string | null
  url: string
}
