import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

/** How the signed-in user relates to a pull request; also the order the groups are listed in. */
export const REVIEW_INVOLVEMENTS = ['awaiting-my-review', 'mine', 'other'] as const
export type ReviewInvolvement = (typeof REVIEW_INVOLVEMENTS)[number]
export type ReviewInvolvementFilter = 'all' | Exclude<ReviewInvolvement, 'other'>

export type ReviewRowAction = 'start-review' | 'continue-review'

type InvolvementFields = Pick<
  AzureDevOpsReviewPullRequest,
  'status' | 'isDraft' | 'createdByMe' | 'reviewRequested' | 'myVote'
>

/** Open, ready for review, naming the user as a reviewer, and not answered with a vote yet. */
export function isAwaitingMyReview(pullRequest: InvolvementFields): boolean {
  return (
    pullRequest.status === 'active' &&
    !pullRequest.isDraft &&
    pullRequest.createdByMe !== true &&
    pullRequest.reviewRequested === true &&
    pullRequest.myVote === 'none'
  )
}

export function reviewInvolvementOf(pullRequest: InvolvementFields): ReviewInvolvement {
  if (pullRequest.createdByMe === true) {
    return 'mine'
  }
  return isAwaitingMyReview(pullRequest) ? 'awaiting-my-review' : 'other'
}

export function isReviewInvolvementFilter(value: unknown): value is ReviewInvolvementFilter {
  return value === 'all' || value === 'awaiting-my-review' || value === 'mine'
}

export function groupByReviewInvolvement<T extends InvolvementFields>(
  pullRequests: readonly T[]
): Record<ReviewInvolvement, T[]> {
  const groups: Record<ReviewInvolvement, T[]> = { 'awaiting-my-review': [], mine: [], other: [] }
  for (const pullRequest of pullRequests) {
    groups[reviewInvolvementOf(pullRequest)].push(pullRequest)
  }
  return groups
}

/** The one action a list row leads with; unpublished drafts outrank a review not started yet. */
export function reviewRowAction(
  pullRequest: InvolvementFields,
  draftCount: number
): ReviewRowAction | null {
  if (pullRequest.status !== 'active') {
    return null
  }
  if (draftCount > 0) {
    return 'continue-review'
  }
  return isAwaitingMyReview(pullRequest) ? 'start-review' : null
}
