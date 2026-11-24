import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isAwaitingMyReview, reviewInvolvementOf } from '../../../shared/azure-devops-review-groups'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewRepo
} from '../../../shared/azure-devops-review-types'
import { azureDevOpsReviewVoteObstacle } from '../../../shared/azure-devops-review-vote'
import type { HostedReviewInfo } from '../../../shared/hosted-review'
import { AzureDevOpsReviewListParams } from '../../../shared/rpc-contract/azure-devops-review-params'
import { workPullRequestFromAzureDevOps } from '../../../shared/work-flow/azure-devops-work-facts'
import { workPullRequestFromHostedReview } from '../../../shared/work-flow/hosted-review-work-facts'
import { knownWorkFact } from '../../../shared/work-flow/work-fact'
import { deriveWorkPhase } from '../../../shared/work-flow/work-phase'
import type { WorkPullRequest } from '../../../shared/work-flow/work-unit-facts'
import { mapAzureDevOpsReviewPullRequest } from './azure-devops-review-mappers'
import { AzureDevOpsWorkFactsStore } from './azure-devops-work-facts-store'

/**
 * Work flow facts between builds of different age. The build before them (commit 5a0c73e8d6)
 * listed a pull request without `workFacts` and marked authorship only with `createdByMe: true`.
 * Its shapes are written out here so that both directions stay pinned.
 */

const repo: AzureDevOpsReviewRepo = {
  key: 'dev.azure.com/contoso/web/shop',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'shop',
  orcaRepoIds: ['r1']
}
const context = { repo, repositoryId: 'repo', repositoryWebUrl: 'https://example.test', meId: 'me' }
const NOW = Date.parse('2026-11-20T12:00:00.000Z')

/** A pull request exactly as the older host listed it: every field required, nothing else. */
const pullRequestOfAnOlderHost = z.strictObject({
  key: z.string(),
  pullRequestId: z.number(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['active', 'completed', 'abandoned']),
  isDraft: z.boolean(),
  isFork: z.boolean(),
  organizationKey: z.string(),
  organizationLabel: z.string(),
  project: z.string(),
  repository: z.string(),
  repositoryId: z.string(),
  repoKey: z.string(),
  author: z.strictObject({ displayName: z.string(), uniqueName: z.string().nullable() }),
  myVote: z.enum([
    'approved',
    'approved-with-suggestions',
    'none',
    'waiting-for-author',
    'rejected'
  ]),
  reviewRequested: z.literal(true).optional(),
  createdByMe: z.literal(true).optional(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  sourceCommit: z.string().nullable(),
  targetCommit: z.string().nullable(),
  webUrl: z.string()
})

/** What the older host sent for the same pull request: the fields it knew, by name. */
function asOlderHost(pullRequest: AzureDevOpsReviewPullRequest): AzureDevOpsReviewPullRequest {
  const { workFacts: _workFacts, createdByMe, ...known } = pullRequest
  return pullRequestOfAnOlderHost.parse(createdByMe === true ? { ...known, createdByMe } : known)
}

function listed(raw: Parameters<typeof mapAzureDevOpsReviewPullRequest>[0]) {
  const mapped = mapAzureDevOpsReviewPullRequest(raw, context)
  if (!mapped) {
    throw new Error('expected a pull request')
  }
  return mapped
}

function phaseOf(pullRequest: WorkPullRequest) {
  return deriveWorkPhase({
    branch: null,
    pullRequest: knownWorkFact(pullRequest),
    release: { production: { state: 'unreleased' }, dev: { state: 'off' } }
  })
}

const rawMine = {
  pullRequestId: 7,
  status: 'active',
  createdBy: { id: 'me' },
  creationDate: '2026-11-16T09:00:00Z',
  reviewers: [{ id: 'ada', displayName: 'Ada', vote: 10, isRequired: true }]
}
const rawTheirs = {
  ...rawMine,
  pullRequestId: 8,
  createdBy: { id: 'ada' },
  reviewers: [{ id: 'me' }]
}

describe('work flow facts between a client and a host of different versions', () => {
  describe('an older client with this host', () => {
    it('sends the list request this host still parses, and gets no field it relied on changed', () => {
      expect(AzureDevOpsReviewListParams.parse({ status: 'active' })).toEqual({ status: 'active' })
      for (const raw of [rawMine, rawTheirs]) {
        const now = listed(raw)
        // Dropping what the older client never read leaves exactly what the older host sent.
        expect(asOlderHost(now)).toEqual(
          Object.fromEntries(
            Object.entries(now).filter(
              ([key, value]) => key !== 'workFacts' && !(key === 'createdByMe' && value === false)
            )
          )
        )
      }
    })

    it('groups and guards pull requests as before although someone else’s now says false', () => {
      const theirs = listed(rawTheirs)
      expect(theirs.createdByMe).toBe(false)
      const before = asOlderHost(theirs)
      expect(reviewInvolvementOf(theirs)).toBe(reviewInvolvementOf(before))
      expect(isAwaitingMyReview(theirs)).toBe(true)
      expect(azureDevOpsReviewVoteObstacle(theirs)).toBe(azureDevOpsReviewVoteObstacle(before))
      const mine = listed(rawMine)
      expect(reviewInvolvementOf(mine)).toBe('mine')
      expect(azureDevOpsReviewVoteObstacle(mine)).toBe('own')
    })
  })

  describe('this client with an older host', () => {
    it('reads the missing facts of the user’s open pull request as unknown, never as none', () => {
      const pullRequest = workPullRequestFromAzureDevOps(asOlderHost(listed(rawMine)), NOW)
      expect(pullRequest.review).toEqual({ known: false, reason: 'host-unsupported' })
      expect(pullRequest.lastVersionAt).toBeNull()
      expect(phaseOf(pullRequest)).toEqual({
        kind: 'unknown',
        missing: 'review',
        reason: 'host-unsupported'
      })
    })

    it('does not take a pull request without an authorship mark for someone else’s', () => {
      const pullRequest = workPullRequestFromAzureDevOps(asOlderHost(listed(rawTheirs)), NOW)
      expect(pullRequest.createdByUser).toBeNull()
      expect(phaseOf(pullRequest).kind).not.toBe('not-work')
    })

    it('keeps a merged pull request unknown without the merge commit', () => {
      const merged = listed({
        ...rawMine,
        status: 'completed',
        closedDate: '2026-11-19T08:00:00Z',
        lastMergeCommit: { commitId: 'squash1' }
      })
      expect(phaseOf(workPullRequestFromAzureDevOps(merged, NOW))).toMatchObject({
        kind: 'phase',
        phase: 'merged-unreleased'
      })
      expect(phaseOf(workPullRequestFromAzureDevOps(asOlderHost(merged), NOW))).toEqual({
        kind: 'unknown',
        missing: 'merge-commit',
        reason: 'not-provided'
      })
    })

    it('reads a hosted review without merge fields as a merge whose commit is unknown', () => {
      const review: HostedReviewInfo = {
        provider: 'github',
        number: 41,
        title: 'Export',
        state: 'merged',
        url: 'https://example.test/pull/41',
        status: 'success',
        updatedAt: '2026-11-19T09:00:00Z',
        mergeable: 'UNKNOWN',
        reviewDecision: 'APPROVED'
      }
      expect(phaseOf(workPullRequestFromHostedReview(review))).toEqual({
        kind: 'unknown',
        missing: 'merge-commit',
        reason: 'not-provided'
      })
    })
  })

  describe('this host before its first background round', () => {
    it('lists the user’s pull request without activity, which reads as not loaded', () => {
      const store = new AzureDevOpsWorkFactsStore()
      const pullRequest = store.withActivity(listed(rawMine))
      expect(pullRequest.workFacts).toEqual({
        reviewers: [{ name: 'Ada', vote: 'approved', required: true }],
        mergedAt: null,
        mergeCommit: null
      })
      expect(workPullRequestFromAzureDevOps(pullRequest, NOW).review).toMatchObject({
        known: false,
        reason: 'not-loaded'
      })
    })

    it('adds the activity only to the user’s open pull request it was read for', () => {
      const store = new AzureDevOpsWorkFactsStore()
      const activity = {
        lastVersionAt: '2026-11-17T09:00:00Z',
        unresolvedThreads: 0,
        lastFeedbackAt: null,
        readAt: '2026-11-20T11:55:00.000Z'
      }
      const mine = listed(rawMine)
      store.recordActivity(mine.key, { activity, sourceCommit: null, fingerprint: '' })
      store.recordActivity(listed(rawTheirs).key, { activity, sourceCommit: null, fingerprint: '' })
      expect(store.withActivity(mine).workFacts?.activity).toEqual(activity)
      expect(store.withActivity(listed(rawTheirs))).not.toHaveProperty('workFacts')
      expect(phaseOf(workPullRequestFromAzureDevOps(store.withActivity(mine), NOW))).toEqual({
        kind: 'phase',
        phase: 'approved',
        since: '2026-11-17T09:00:00Z',
        sinceExact: false
      })
    })
  })
})
