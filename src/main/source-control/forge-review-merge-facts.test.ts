import { describe, expect, it } from 'vitest'
import { knownWorkFact } from '../../shared/work-flow/work-fact'
import { workPullRequestFromHostedReview } from '../../shared/work-flow/hosted-review-work-facts'
import { deriveWorkPhase } from '../../shared/work-flow/work-phase'
import type { HostedReviewInfo } from '../../shared/hosted-review'
import { assemblePRRefreshFoundOutcome } from '../github/client/lookup/pr-refresh-outcome-assembly'
import {
  mapRestPullRequest,
  PR_LOOKUP_JSON_FIELDS,
  type PullRequestLookupData
} from '../github/client/lookup/pull-request-lookup-data'
import { mapMRInfo } from '../gitlab/mappers'
import {
  mapBitbucketReview,
  mapGiteaReview,
  mapGitHubReview,
  mapGitLabReview
} from './forge-review-mappers'

const MERGED_AT = '2026-11-19T08:00:00Z'

function gitHubReview(data: PullRequestLookupData): HostedReviewInfo {
  const outcome = assemblePRRefreshFoundOutcome({
    data,
    dataRepo: null,
    dataHeadRepo: null,
    stack: undefined,
    mergeable: 'UNKNOWN',
    stackMergeQueueRequired: undefined,
    confirmedContainedHeadOid: null,
    headDivergedFromMergedPRAtOid: null,
    conflictSummary: undefined
  })
  if (outcome.kind !== 'found') {
    throw new Error('expected a pull request')
  }
  return mapGitHubReview(outcome.pr)
}

function phaseOf(review: HostedReviewInfo) {
  return deriveWorkPhase({
    branch: null,
    pullRequest: knownWorkFact(workPullRequestFromHostedReview(review)),
    release: { production: { state: 'unreleased' }, dev: { state: 'off' } }
  })
}

const ghData: PullRequestLookupData = {
  number: 41,
  title: 'Export',
  state: 'MERGED',
  url: 'https://example.test/pull/41',
  statusCheckRollup: [],
  updatedAt: '2026-11-19T09:00:00Z',
  mergeable: 'UNKNOWN'
}

describe('merge facts of GitHub pull requests', () => {
  it('asks gh for the merge time and commit in the lookup it already makes', () => {
    expect(PR_LOOKUP_JSON_FIELDS.split(',')).toEqual(
      expect.arrayContaining(['mergedAt', 'mergeCommit'])
    )
  })

  it('carries the commit a squash left on the base branch', () => {
    const review = gitHubReview({ ...ghData, mergedAt: MERGED_AT, mergeCommit: { oid: 'squash1' } })
    expect(review).toMatchObject({ mergedAt: MERGED_AT, mergeCommitOid: 'squash1' })
    expect(phaseOf(review)).toEqual({
      kind: 'phase',
      phase: 'merged-unreleased',
      since: MERGED_AT,
      sinceExact: true
    })
  })

  it('reads both from the REST payload, and not the trial merge of an open pull request', () => {
    const rest = { number: 41, title: 'Export', state: 'closed' }
    expect(
      gitHubReview(mapRestPullRequest({ ...rest, merged_at: MERGED_AT, merge_commit_sha: 'm1' }))
    ).toMatchObject({ state: 'merged', mergedAt: MERGED_AT, mergeCommitOid: 'm1' })
    const open = gitHubReview(
      mapRestPullRequest({ ...rest, state: 'open', merged_at: null, merge_commit_sha: 'trial' })
    )
    expect(open).not.toHaveProperty('mergeCommitOid')
    expect(open).not.toHaveProperty('mergedAt')
  })

  it('keeps the phase unknown when the lookup named no merge commit', () => {
    const review = gitHubReview({ ...ghData, mergedAt: null, mergeCommit: null })
    expect(review).not.toHaveProperty('mergeCommitOid')
    expect(phaseOf(review)).toEqual({
      kind: 'unknown',
      missing: 'merge-commit',
      reason: 'not-provided'
    })
  })
})

describe('merge facts of GitLab merge requests', () => {
  const merged = { iid: 9, title: 'Export', state: 'merged', sha: 'head1', merged_at: MERGED_AT }
  const review = (raw: Parameters<typeof mapMRInfo>[0]): HostedReviewInfo =>
    mapGitLabReview(mapMRInfo(raw, 'neutral'))

  it('names the commit on the target branch for a merge commit, a squash and a fast-forward', () => {
    expect(
      review({ ...merged, merge_commit_sha: 'merge1', squash_commit_sha: 'squash1' })
    ).toMatchObject({ mergedAt: MERGED_AT, mergeCommitOid: 'merge1' })
    expect(
      review({ ...merged, merge_commit_sha: null, squash_commit_sha: 'squash1' })
    ).toMatchObject({ mergeCommitOid: 'squash1' })
    expect(review({ ...merged, merge_commit_sha: null })).toMatchObject({ mergeCommitOid: 'head1' })
  })

  it('names none while the merge request is open', () => {
    const open = review({ ...merged, state: 'opened', merged_at: null, merge_commit_sha: 'x' })
    expect(open).not.toHaveProperty('mergeCommitOid')
    expect(open).not.toHaveProperty('mergedAt')
  })

  it('still has no review verdict, so an open merge request stays unknown', () => {
    expect(phaseOf(review({ ...merged, state: 'opened' }))).toEqual({
      kind: 'unknown',
      missing: 'review',
      reason: 'not-provided'
    })
  })
})

describe('providers whose lookup names no merge commit', () => {
  it('leave a merged pull request unknown instead of unreleased', () => {
    const pr = {
      number: 3,
      title: 'Export',
      state: 'merged' as const,
      url: 'https://example.test/3',
      status: 'neutral' as const,
      updatedAt: MERGED_AT,
      mergeable: 'UNKNOWN' as const
    }
    for (const review of [mapBitbucketReview(pr), mapGiteaReview(pr)]) {
      expect(workPullRequestFromHostedReview(review)).toMatchObject({
        mergedAt: null,
        mergeCommit: null,
        createdByUser: null,
        lastVersionAt: null
      })
      expect(phaseOf(review)).toMatchObject({ kind: 'unknown', missing: 'merge-commit' })
    }
  })
})
