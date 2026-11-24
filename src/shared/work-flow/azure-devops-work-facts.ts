/**
 * Pull request facts from the Azure DevOps list. A field the host did not send, or read too long
 * ago, leaves its fact unknown.
 */

import { AZURE_DEVOPS_WORK_FACTS_VALID_MS } from '../azure-devops-pull-request-work-facts'
import type { AzureDevOpsReviewPullRequest } from '../azure-devops-review-types'
import type { HostedReviewState } from '../hosted-review'
import { knownWorkFact, unknownWorkFact, type WorkFact } from './work-fact'
import { workReviewVerdictFromVotes } from './work-review-verdict'
import type { WorkPullRequest, WorkReview } from './work-unit-facts'

function stateOf(pullRequest: AzureDevOpsReviewPullRequest): HostedReviewState {
  if (pullRequest.status === 'completed') {
    return 'merged'
  }
  if (pullRequest.status === 'abandoned') {
    return 'closed'
  }
  return pullRequest.isDraft ? 'draft' : 'open'
}

function latest(times: readonly (string | null | undefined)[]): string | null {
  let found: string | null = null
  let foundMs = Number.NEGATIVE_INFINITY
  for (const time of times) {
    const ms = time ? Date.parse(time) : Number.NaN
    if (time && ms > foundMs) {
      found = time
      foundMs = ms
    }
  }
  return found
}

function reviewOf(pullRequest: AzureDevOpsReviewPullRequest, nowMs: number): WorkFact<WorkReview> {
  const facts = pullRequest.workFacts
  if (!facts) {
    // Someone else's pull request carries no facts by design; the user's own lacks them only
    // from a host that does not report them.
    return unknownWorkFact(pullRequest.createdByMe === true ? 'host-unsupported' : 'not-provided')
  }
  const votes = { verdict: workReviewVerdictFromVotes(facts.reviewers), reviewers: facts.reviewers }
  const activity = facts.activity
  if (!activity) {
    const review = { ...votes, unresolvedThreads: null, lastFeedbackAt: null }
    // Threads decide the phase of an open pull request only, so only there their absence matters.
    return pullRequest.status === 'active'
      ? unknownWorkFact('not-loaded', review)
      : knownWorkFact(review)
  }
  const review = {
    ...votes,
    unresolvedThreads: activity.unresolvedThreads,
    lastFeedbackAt: activity.lastFeedbackAt
  }
  const readMs = Date.parse(activity.readAt)
  return nowMs - readMs <= AZURE_DEVOPS_WORK_FACTS_VALID_MS
    ? knownWorkFact(review, activity.readAt)
    : unknownWorkFact('source-failed', review)
}

export function workPullRequestFromAzureDevOps(
  pullRequest: AzureDevOpsReviewPullRequest,
  nowMs: number
): WorkPullRequest {
  const facts = pullRequest.workFacts
  const review = reviewOf(pullRequest, nowMs)
  const lastVersionAt = review.known ? (facts?.activity?.lastVersionAt ?? null) : null
  return {
    provider: 'azure-devops',
    number: pullRequest.pullRequestId,
    title: pullRequest.title,
    url: pullRequest.webUrl,
    state: stateOf(pullRequest),
    // Absent means the host could not tell who is signed in, or does not say.
    createdByUser: pullRequest.createdByMe ?? null,
    sourceBranch: pullRequest.sourceBranch || null,
    targetBranch: pullRequest.targetBranch || null,
    // Azure DevOps dates no "last activity", so it is the latest of the moments it does date.
    updatedAt: latest([
      pullRequest.createdAt,
      pullRequest.closedAt,
      facts?.activity?.lastVersionAt,
      facts?.activity?.lastFeedbackAt
    ]),
    lastVersionAt,
    review,
    mergedAt: facts?.mergedAt ?? null,
    mergeCommit: facts?.mergeCommit ?? null
  }
}
