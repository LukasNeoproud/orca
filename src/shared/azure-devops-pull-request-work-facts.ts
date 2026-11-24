// What `azureDevOpsReview.list` says about a pull request the signed-in user created, for the work
// flow. Every field is optional on the wire: a missing one is unknown, never empty.

import type { AzureDevOpsReviewVote } from './azure-devops-review-types'

/** How often the host that leads the repository re-reads these facts. */
export const AZURE_DEVOPS_WORK_FACTS_REFRESH_MS = 15 * 60_000
/** A fact holds for two refresh intervals after it was read; past that it is unknown. */
export const AZURE_DEVOPS_WORK_FACTS_VALID_MS = 2 * AZURE_DEVOPS_WORK_FACTS_REFRESH_MS

export type AzureDevOpsPullRequestReviewer = {
  name: string
  vote: AzureDevOpsReviewVote
  required: boolean
}

/** Read from the pull request's threads and iterations by the host's background refresh. */
export type AzureDevOpsPullRequestActivity = {
  /** When the last iteration was pushed; null when Azure DevOps dated none. */
  lastVersionAt: string | null
  /** Open threads started by someone other than the signed-in user. */
  unresolvedThreads: number
  /** Last comment or blocking vote by someone else; null when there is none. */
  lastFeedbackAt: string | null
  readAt: string
}

export type AzureDevOpsPullRequestWorkFacts = {
  reviewers: AzureDevOpsPullRequestReviewer[]
  /** Null while the pull request is not completed. */
  mergedAt: string | null
  /** The commit the completion left on the target branch, also after a squash. */
  mergeCommit: string | null
  /** Absent until the host has read it, and for a pull request that is not open. */
  activity?: AzureDevOpsPullRequestActivity
}
