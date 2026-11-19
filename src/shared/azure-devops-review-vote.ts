import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewVote
} from './azure-devops-review-types'

/** Votes a reviewer can cast from Orca; resetting to no vote stays in Azure DevOps. */
export const AZURE_DEVOPS_REVIEW_CASTABLE_VOTES = [
  'approved',
  'approved-with-suggestions',
  'waiting-for-author',
  'rejected'
] as const satisfies readonly AzureDevOpsReviewVote[]

export type AzureDevOpsReviewCastableVote = (typeof AZURE_DEVOPS_REVIEW_CASTABLE_VOTES)[number]

export function isAzureDevOpsReviewCastableVote(
  value: unknown
): value is AzureDevOpsReviewCastableVote {
  return AZURE_DEVOPS_REVIEW_CASTABLE_VOTES.some((vote) => vote === value)
}

/** The `vote` number of the pull request reviewers REST resource. */
export function azureDevOpsReviewVoteToWire(vote: AzureDevOpsReviewCastableVote): number {
  switch (vote) {
    case 'approved':
      return 10
    case 'approved-with-suggestions':
      return 5
    case 'waiting-for-author':
      return -5
    case 'rejected':
      return -10
  }
}

/** Why a vote cannot be cast on this pull request; null when it can. A fork is no obstacle. */
export function azureDevOpsReviewVoteObstacle(
  pullRequest: Pick<AzureDevOpsReviewPullRequest, 'status' | 'createdByMe'>
): 'own' | 'closed' | null {
  if (pullRequest.createdByMe === true) {
    return 'own'
  }
  return pullRequest.status === 'active' ? null : 'closed'
}

/**
 * What happened to the vote of one publish. `skipped` means a comment failed first, so the vote
 * was never sent; `failed` means Azure DevOps or the host refused it.
 */
export type AzureDevOpsReviewVoteOutcome = {
  vote: AzureDevOpsReviewCastableVote
  status: 'sent' | 'skipped' | 'failed'
  error: string | null
}
