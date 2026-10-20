import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

export const AZURE_DEVOPS_REVIEW_REMOTE = 'origin'

type ReviewedPullRequest = Pick<
  AzureDevOpsReviewPullRequest,
  'status' | 'targetBranch' | 'sourceCommit' | 'targetCommit'
>

/**
 * The commits a closed PR was last merged from and against; null for an active PR.
 * Why pinned: a closed PR's source branch is usually deleted, and its target now holds the change.
 */
export function closedAzureDevOpsReviewCommits(
  pullRequest: ReviewedPullRequest
): { source: string; target: string } | null {
  if (pullRequest.status !== 'completed' && pullRequest.status !== 'abandoned') {
    return null
  }
  const { sourceCommit, targetCommit } = pullRequest
  return sourceCommit && targetCommit ? { source: sourceCommit, target: targetCommit } : null
}

/** What the review compares HEAD against: `git diff <base>...HEAD` is the PR's change. */
export function azureDevOpsReviewBaseRef(pullRequest: ReviewedPullRequest): string {
  return (
    closedAzureDevOpsReviewCommits(pullRequest)?.target ??
    `${AZURE_DEVOPS_REVIEW_REMOTE}/${pullRequest.targetBranch}`
  )
}
