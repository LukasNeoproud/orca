import type { AzureDevOpsReviewPublishResult } from '../../../../shared/azure-devops-review-types'
import type { AzureDevOpsReviewCastableVote } from '../../../../shared/azure-devops-review-vote'

export type AzureDevOpsReviewPublishOutcome = {
  commentsPosted: number
  commentsFailed: number
  /** `unacknowledged`: the host answered without a word about the vote, so it never sent one. */
  vote: 'not-requested' | 'sent' | 'skipped' | 'failed' | 'unacknowledged'
  voteError: string | null
  /** Everything the user confirmed reached Azure DevOps. */
  complete: boolean
}

export function summarizeAzureDevOpsReviewPublish(
  result: AzureDevOpsReviewPublishResult,
  requestedVote: AzureDevOpsReviewCastableVote | null
): AzureDevOpsReviewPublishOutcome {
  const commentsFailed = result.results.filter((entry) => !entry.ok).length
  // Why compare the vote: an answer about another vote says nothing about the one asked for.
  const answered = result.vote && result.vote.vote === requestedVote ? result.vote : null
  const vote = requestedVote === null ? 'not-requested' : (answered?.status ?? 'unacknowledged')
  return {
    commentsPosted: result.results.length - commentsFailed,
    commentsFailed,
    vote,
    voteError: answered?.error ?? null,
    complete: commentsFailed === 0 && (vote === 'not-requested' || vote === 'sent')
  }
}

/** A publish that did not send everything the user confirmed. */
export type AzureDevOpsReviewPublishFailure =
  | { kind: 'incomplete'; outcome: AzureDevOpsReviewPublishOutcome }
  | { kind: 'error'; message: string }
