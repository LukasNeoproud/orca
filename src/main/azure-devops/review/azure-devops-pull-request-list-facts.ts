import type { AzureDevOpsPullRequestWorkFacts } from '../../../shared/azure-devops-pull-request-work-facts'
import type { AzureDevOpsReviewVote } from '../../../shared/azure-devops-review-types'
import type { RawReviewPullRequest } from './azure-devops-review-mappers'

/** The work flow facts the pull request list already carries, at no further request. */
export function azureDevOpsPullRequestListFacts(
  raw: RawReviewPullRequest,
  // Why passed in: the mappers call this, so importing them back would be a cycle.
  mapVote: (vote: number | null | undefined) => AzureDevOpsReviewVote
): AzureDevOpsPullRequestWorkFacts {
  const completed = raw.status?.trim().toLowerCase() === 'completed'
  return {
    reviewers: (raw.reviewers ?? []).map((reviewer) => ({
      name: reviewer.displayName?.trim() || reviewer.uniqueName?.trim() || 'Unknown',
      vote: mapVote(reviewer.vote),
      required: reviewer.isRequired === true
    })),
    mergedAt: completed ? (raw.closedDate ?? null) : null,
    // Why only when completed: on an open pull request this is the trial merge, not a commit of
    // the target branch.
    mergeCommit: completed ? raw.lastMergeCommit?.commitId?.trim() || null : null
  }
}
