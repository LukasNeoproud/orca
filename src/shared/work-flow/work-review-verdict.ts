import type { WorkReviewer, WorkReviewVerdict } from './work-unit-facts'

/** What the votes add up to: one blocking vote outweighs any approval. */
export function workReviewVerdictFromVotes(
  reviewers: readonly Pick<WorkReviewer, 'vote' | 'required'>[]
): WorkReviewVerdict {
  const approves = (reviewer: Pick<WorkReviewer, 'vote'>): boolean =>
    reviewer.vote === 'approved' || reviewer.vote === 'approved-with-suggestions'
  if (reviewers.some(({ vote }) => vote === 'waiting-for-author' || vote === 'rejected')) {
    return 'changes-requested'
  }
  const requiredApproved = reviewers.every((reviewer) => !reviewer.required || approves(reviewer))
  return reviewers.some(approves) && requiredApproved ? 'approved' : 'none'
}
