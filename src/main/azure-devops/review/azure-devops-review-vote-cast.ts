import type { AzureDevOpsReviewPublishResult } from '../../../shared/azure-devops-review-types'
import {
  azureDevOpsReviewVoteObstacle,
  azureDevOpsReviewVoteToWire,
  type AzureDevOpsReviewCastableVote,
  type AzureDevOpsReviewVoteOutcome
} from '../../../shared/azure-devops-review-vote'
import {
  castAzureDevOpsReviewVote,
  getAzureDevOpsReviewIdentity,
  getAzureDevOpsReviewPullRequest,
  type AzureDevOpsPullRequestTarget
} from './azure-devops-review-client'
import { mapAzureDevOpsReviewPullRequest } from './azure-devops-review-mappers'
import {
  describeAzureDevOpsReviewError,
  type AzureDevOpsResolvedPullRequest
} from './azure-devops-review-service'

export type AzureDevOpsReviewVoter = { reviewerId: string }

/**
 * A vote is the user's own statement, so only a caller with the user in front of it may send one.
 * The runtime socket is what `orca ado`, its MCP server and agent extensions call through.
 */
export function assertAzureDevOpsReviewVoteCaller(caller: { kind: string } | undefined): void {
  if (caller?.kind !== 'desktop' && caller?.kind !== 'paired-device') {
    throw new Error('A vote is cast only from the Orca app, after the user confirms it.')
  }
}

/** The signed-in reviewer, once the pull request is known to take a vote from them. */
export async function resolveAzureDevOpsReviewVoter(
  resolved: AzureDevOpsResolvedPullRequest
): Promise<AzureDevOpsReviewVoter> {
  const identity = await getAzureDevOpsReviewIdentity(resolved.source)
  const pullRequest = mapAzureDevOpsReviewPullRequest(
    await getAzureDevOpsReviewPullRequest(resolved.target),
    {
      repo: resolved.source,
      repositoryId: resolved.target.repositoryId,
      repositoryWebUrl: resolved.repositoryWebUrl,
      meId: identity.id
    }
  )
  if (!pullRequest) {
    throw new Error('Azure DevOps returned an unreadable pull request.')
  }
  const obstacle = azureDevOpsReviewVoteObstacle(pullRequest)
  if (obstacle === 'own') {
    throw new Error('Nothing was published: Orca does not vote on your own pull request.')
  }
  if (obstacle === 'closed') {
    throw new Error('Nothing was published: the pull request is closed and takes no vote.')
  }
  return { reviewerId: identity.id }
}

/** Sends the vote unless a comment failed; never throws, so the comment results always return. */
export async function castAzureDevOpsReviewVoteAfterDrafts(
  target: AzureDevOpsPullRequestTarget,
  voter: AzureDevOpsReviewVoter,
  vote: AzureDevOpsReviewCastableVote,
  results: AzureDevOpsReviewPublishResult['results']
): Promise<AzureDevOpsReviewVoteOutcome> {
  if (results.some((result) => !result.ok)) {
    return { vote, status: 'skipped', error: null }
  }
  try {
    await castAzureDevOpsReviewVote(target, voter.reviewerId, azureDevOpsReviewVoteToWire(vote))
    return { vote, status: 'sent', error: null }
  } catch (error) {
    return { vote, status: 'failed', error: describeAzureDevOpsReviewError(error) }
  }
}
