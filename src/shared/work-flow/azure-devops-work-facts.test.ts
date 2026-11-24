import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsPullRequestActivity,
  AzureDevOpsPullRequestWorkFacts
} from '../azure-devops-pull-request-work-facts'
import type { AzureDevOpsReviewPullRequest } from '../azure-devops-review-types'
import { workPullRequestFromAzureDevOps } from './azure-devops-work-facts'
import { knownWorkFact } from './work-fact'
import { deriveWorkPhase } from './work-phase'
import type { WorkRelease } from './work-unit-facts'

const CREATED = '2026-11-16T09:00:00.000Z'
const VERSION = '2026-11-17T09:00:00.000Z'
const FEEDBACK = '2026-11-18T09:00:00.000Z'
const READ = '2026-11-20T12:00:00.000Z'
const NOW = Date.parse('2026-11-20T12:10:00.000Z')
const UNRELEASED: WorkRelease = {
  production: { state: 'unreleased' },
  dev: { state: 'unreleased' }
}

const activity: AzureDevOpsPullRequestActivity = {
  lastVersionAt: VERSION,
  unresolvedThreads: 0,
  lastFeedbackAt: null,
  readAt: READ
}

function facts(
  overrides: Partial<AzureDevOpsPullRequestWorkFacts> = {}
): AzureDevOpsPullRequestWorkFacts {
  return { reviewers: [], mergedAt: null, mergeCommit: null, activity, ...overrides }
}

function pullRequest(
  overrides: Partial<AzureDevOpsReviewPullRequest> = {}
): AzureDevOpsReviewPullRequest {
  return {
    key: 'dev.azure.com/contoso+repo+12',
    pullRequestId: 12,
    title: 'Add sign-in',
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: 'dev.azure.com/contoso',
    organizationLabel: 'contoso',
    project: 'Web',
    repository: 'shop',
    repositoryId: 'repo',
    repoKey: 'dev.azure.com/contoso/web/shop',
    author: { displayName: 'Me', uniqueName: null },
    myVote: 'none',
    createdByMe: true,
    workFacts: facts(),
    createdAt: CREATED,
    closedAt: null,
    sourceBranch: 'feature/sign-in',
    targetBranch: 'main',
    sourceCommit: 'aaa',
    targetCommit: 'bbb',
    webUrl: 'https://dev.azure.com/contoso/Web/_git/shop/pullrequest/12',
    ...overrides
  }
}

function phaseOf(pr: AzureDevOpsReviewPullRequest, nowMs = NOW) {
  return deriveWorkPhase({
    branch: null,
    pullRequest: knownWorkFact(workPullRequestFromAzureDevOps(pr, nowMs)),
    release: UNRELEASED
  })
}

describe('workPullRequestFromAzureDevOps', () => {
  it('carries reviewers with votes, the last version, open threads and the last feedback', () => {
    const reviewers = [
      { name: 'Ada', vote: 'waiting-for-author' as const, required: true },
      { name: 'Bob', vote: 'approved' as const, required: false }
    ]
    const mapped = workPullRequestFromAzureDevOps(
      pullRequest({
        workFacts: facts({
          reviewers,
          activity: { ...activity, unresolvedThreads: 2, lastFeedbackAt: FEEDBACK }
        })
      }),
      NOW
    )
    expect(mapped).toMatchObject({
      provider: 'azure-devops',
      number: 12,
      state: 'open',
      createdByUser: true,
      sourceBranch: 'feature/sign-in',
      targetBranch: 'main',
      lastVersionAt: VERSION,
      updatedAt: FEEDBACK,
      mergedAt: null,
      mergeCommit: null
    })
    expect(mapped.review).toEqual({
      known: true,
      readAt: READ,
      value: {
        verdict: 'changes-requested',
        reviewers,
        unresolvedThreads: 2,
        lastFeedbackAt: FEEDBACK
      }
    })
  })

  it('puts an open pull request with feedback the author has not answered into changes requested', () => {
    const waiting = pullRequest({
      workFacts: facts({
        activity: { ...activity, unresolvedThreads: 1, lastFeedbackAt: FEEDBACK }
      })
    })
    expect(phaseOf(waiting)).toEqual({
      kind: 'phase',
      phase: 'changes-requested',
      since: FEEDBACK,
      sinceExact: true
    })
    expect(phaseOf(pullRequest())).toEqual({
      kind: 'phase',
      phase: 'waiting-for-review',
      since: VERSION,
      sinceExact: true
    })
  })

  it('knows when and by which commit a completed pull request was merged', () => {
    const merged = pullRequest({
      status: 'completed',
      closedAt: '2026-11-19T08:00:00.000Z',
      workFacts: { reviewers: [], mergedAt: '2026-11-19T08:00:00.000Z', mergeCommit: 'squash1' }
    })
    expect(workPullRequestFromAzureDevOps(merged, NOW)).toMatchObject({
      state: 'merged',
      mergedAt: '2026-11-19T08:00:00.000Z',
      mergeCommit: 'squash1'
    })
    expect(phaseOf(merged)).toEqual({
      kind: 'phase',
      phase: 'merged-unreleased',
      since: '2026-11-19T08:00:00.000Z',
      sinceExact: true
    })
  })

  it('leaves the review unknown until the host has read the threads', () => {
    const unread = pullRequest({ workFacts: { reviewers: [], mergedAt: null, mergeCommit: null } })
    const mapped = workPullRequestFromAzureDevOps(unread, NOW)
    expect(mapped.review).toMatchObject({ known: false, reason: 'not-loaded' })
    expect(mapped.lastVersionAt).toBeNull()
    expect(phaseOf(unread)).toEqual({ kind: 'unknown', missing: 'review', reason: 'not-loaded' })
  })

  it('stops trusting threads read more than two refresh intervals ago', () => {
    const stale = pullRequest({
      workFacts: facts({ activity: { ...activity, unresolvedThreads: 1 } })
    })
    const later = Date.parse(READ) + 31 * 60_000
    const mapped = workPullRequestFromAzureDevOps(stale, later)
    expect(mapped.review).toMatchObject({
      known: false,
      reason: 'source-failed',
      lastKnown: { unresolvedThreads: 1 }
    })
    expect(phaseOf(stale, later)).toEqual({
      kind: 'unknown',
      missing: 'review',
      reason: 'source-failed'
    })
    expect(phaseOf(stale, Date.parse(READ) + 30 * 60_000).kind).toBe('phase')
  })

  it('maps drafts and abandoned pull requests without needing their threads', () => {
    const noActivity = { reviewers: [], mergedAt: null, mergeCommit: null }
    expect(phaseOf(pullRequest({ isDraft: true, workFacts: noActivity }))).toMatchObject({
      kind: 'phase',
      phase: 'draft'
    })
    expect(
      workPullRequestFromAzureDevOps(
        pullRequest({ status: 'abandoned', workFacts: noActivity }),
        NOW
      )
    ).toMatchObject({ state: 'closed', review: { known: true } })
  })

  it('tells a pull request of someone else from one whose author is unknown', () => {
    const theirs = pullRequest({ createdByMe: false, workFacts: undefined })
    expect(workPullRequestFromAzureDevOps(theirs, NOW).createdByUser).toBe(false)
    expect(phaseOf(theirs)).toEqual({ kind: 'not-work', reason: 'pull-request-of-someone-else' })
    const unknown = pullRequest({ createdByMe: undefined, workFacts: undefined })
    expect(workPullRequestFromAzureDevOps(unknown, NOW)).toMatchObject({
      createdByUser: null,
      review: { known: false, reason: 'not-provided' }
    })
  })
})
