/**
 * Pull request facts from what every review provider already gives Orca, so the work flow does
 * not depend on one provider. What `HostedReviewInfo` does not carry stays unknown.
 */

import type { PRReviewDecision } from '../github/pull-request-types'
import type { HostedReviewInfo } from '../hosted-review'
import { knownWorkFact, unknownWorkFact, type WorkFact } from './work-fact'
import type { WorkPullRequest, WorkReview, WorkReviewVerdict } from './work-unit-facts'

const VERDICT_BY_DECISION: Record<PRReviewDecision, WorkReviewVerdict> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  REVIEW_REQUIRED: 'none'
}

function reviewFromDecision(decision: HostedReviewInfo['reviewDecision']): WorkFact<WorkReview> {
  // Absent means the provider's mapper reports no decision at all; null is "none yet".
  if (decision === undefined) {
    return unknownWorkFact('not-provided')
  }
  return knownWorkFact({
    verdict: decision ? VERDICT_BY_DECISION[decision] : 'none',
    reviewers: [],
    unresolvedThreads: null,
    lastFeedbackAt: null
  })
}

export function workPullRequestFromHostedReview(
  review: HostedReviewInfo,
  sourceBranch: string | null = null
): WorkPullRequest {
  return {
    provider: review.provider,
    number: review.number,
    title: review.title,
    url: review.url,
    state: review.state,
    createdByUser: null,
    sourceBranch,
    targetBranch: review.baseRefName ?? null,
    updatedAt: review.updatedAt || null,
    lastVersionAt: null,
    review: reviewFromDecision(review.reviewDecision),
    mergedAt: review.mergedAt ?? null,
    mergeCommit: review.mergeCommitOid ?? null
  }
}
