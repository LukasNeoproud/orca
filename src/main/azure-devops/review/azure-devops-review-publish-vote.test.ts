import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  azureDevOpsPullRequestKey,
  type AzureDevOpsReviewDraft
} from '../../../shared/azure-devops-review-types'
import { AZURE_DEVOPS_REVIEW_CASTABLE_VOTES } from '../../../shared/azure-devops-review-vote'
import { publishAzureDevOpsReviewDrafts } from './azure-devops-review-draft-actions'
import {
  _setAzureDevOpsReviewDraftStorePath,
  getStoredAzureDevOpsReviewDraft,
  putStoredAzureDevOpsReviewDraft
} from './azure-devops-review-draft-store'
import type { RawReviewPullRequest } from './azure-devops-review-mappers'

const source = {
  key: 'dev.azure.com/contoso/web/app',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'app',
  orcaRepoIds: ['r1']
}
const ME = 'Me-Guid-1'
const pullRequestKey = azureDevOpsPullRequestKey(source.organizationKey, 'repo', 7)
const host = { listRepos: () => [] }

type FakeAzureDevOps = {
  /** Every Azure DevOps request in the order it was made. */
  requests: string[]
  pullRequest: RawReviewPullRequest
  failThreadWithBody: string | null
  failVote: string | null
  /** Holds comment posts open until released, to overlap two publishes. */
  gate: Promise<void> | null
}

const fake = vi.hoisted((): FakeAzureDevOps => ({
  requests: [],
  pullRequest: {},
  failThreadWithBody: null,
  failVote: null,
  gate: null
}))

vi.mock('./azure-devops-review-repos', () => ({
  collectAzureDevOpsReviewRepos: async () => [source],
  toAzureDevOpsReviewRepo: (repo: unknown) => repo
}))

vi.mock('./azure-devops-review-client', () => ({
  resolveAzureDevOpsReviewRepository: async () => ({
    id: 'repo',
    webUrl: 'https://dev.azure.com/contoso/Web/_git/app'
  }),
  getAzureDevOpsReviewIdentity: async () => {
    fake.requests.push('GET connectionData')
    return { id: ME, displayName: 'Me', at: 0 }
  },
  getAzureDevOpsReviewPullRequest: async () => {
    fake.requests.push('GET pullRequest')
    return fake.pullRequest
  },
  listAzureDevOpsReviewIterations: async () => [
    { id: 1, sourceRefCommit: { commitId: 's1' }, commonRefCommit: { commitId: 'b' } }
  ],
  listAzureDevOpsReviewIterationChanges: async () => [],
  listAzureDevOpsReviewThreads: async () => [],
  createAzureDevOpsReviewThread: async (
    _target: unknown,
    payload: { comments: { content: string }[] }
  ) => {
    const body = payload.comments[0]?.content ?? ''
    fake.requests.push(`POST thread ${body}`)
    await fake.gate
    if (body === fake.failThreadWithBody) {
      throw new Error('Azure DevOps request failed: HTTP 500')
    }
    return { id: 100 + fake.requests.length }
  },
  createAzureDevOpsReviewReply: async () => undefined,
  updateAzureDevOpsReviewThreadStatus: async () => undefined,
  castAzureDevOpsReviewVote: async (_target: unknown, reviewerId: string, vote: number) => {
    fake.requests.push(`PUT reviewer ${reviewerId} vote ${vote}`)
    if (fake.failVote) {
      throw new Error(fake.failVote)
    }
  }
}))

function activePullRequest(patch: Partial<RawReviewPullRequest> = {}): RawReviewPullRequest {
  return {
    pullRequestId: 7,
    title: 'Clamp negative prices',
    status: 'active',
    createdBy: { id: 'ada-guid', displayName: 'Ada Example' },
    reviewers: [{ id: ME.toLowerCase(), vote: 0 }],
    ...patch
  }
}

function draft(id: string, body: string): AzureDevOpsReviewDraft {
  const stored: AzureDevOpsReviewDraft = {
    id,
    pullRequestKey,
    kind: 'general',
    filePath: null,
    anchor: null,
    threadId: null,
    threadStatus: null,
    body,
    author: { kind: 'user' },
    iterationId: 1,
    commit: 's1',
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 1
  }
  putStoredAzureDevOpsReviewDraft(stored)
  return stored
}

const writes = (): string[] => fake.requests.filter((request) => !request.startsWith('GET'))

describe('publishing a review with a vote', () => {
  let directory = ''

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'ado-publish-vote-'))
  })

  beforeEach(() => {
    _setAzureDevOpsReviewDraftStorePath(join(directory, `${Math.random()}.json`))
    fake.requests = []
    fake.pullRequest = activePullRequest()
    fake.failThreadWithBody = null
    fake.failVote = null
    fake.gate = null
  })

  afterAll(() => {
    _setAzureDevOpsReviewDraftStorePath(null)
    rmSync(directory, { recursive: true, force: true })
  })

  it('posts the comments first and the vote last', async () => {
    draft('d1', 'First')
    draft('d2', 'Second')

    const result = await publishAzureDevOpsReviewDrafts(
      host,
      pullRequestKey,
      ['d1', 'd2'],
      'approved'
    )

    expect(writes()).toEqual([
      'POST thread First',
      'POST thread Second',
      `PUT reviewer ${ME} vote 10`
    ])
    expect(result.results.map((entry) => entry.ok)).toEqual([true, true])
    expect(result.vote).toEqual({ vote: 'approved', status: 'sent', error: null })
  })

  it.each([
    ['approved', 10],
    ['approved-with-suggestions', 5],
    ['waiting-for-author', -5],
    ['rejected', -10]
  ] as const)('sends %s as %i', async (vote, wire) => {
    await publishAzureDevOpsReviewDrafts(host, pullRequestKey, [], vote)

    expect(writes()).toEqual([`PUT reviewer ${ME} vote ${wire}`])
    expect(AZURE_DEVOPS_REVIEW_CASTABLE_VOTES).toContain(vote)
  })

  it('sends a vote with no comment selected', async () => {
    draft('d1', 'Stays a draft')

    const result = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, [], 'rejected')

    expect(writes()).toEqual([`PUT reviewer ${ME} vote -10`])
    expect(result).toEqual({
      results: [],
      vote: { vote: 'rejected', status: 'sent', error: null }
    })
    expect(getStoredAzureDevOpsReviewDraft('d1')?.state).toBe('draft')
  })

  it('holds the vote back when a comment fails and reports each comment', async () => {
    draft('d1', 'First')
    draft('d2', 'Second')
    draft('d3', 'Third')
    fake.failThreadWithBody = 'Second'

    const result = await publishAzureDevOpsReviewDrafts(
      host,
      pullRequestKey,
      ['d1', 'd2', 'd3'],
      'approved'
    )

    expect(writes()).toEqual(['POST thread First', 'POST thread Second', 'POST thread Third'])
    expect(result.results).toEqual([
      { draftId: 'd1', ok: true, error: null },
      { draftId: 'd2', ok: false, error: 'Azure DevOps request failed: HTTP 500' },
      { draftId: 'd3', ok: true, error: null }
    ])
    expect(result.vote).toEqual({ vote: 'approved', status: 'skipped', error: null })
    expect(getStoredAzureDevOpsReviewDraft('d2')?.state).toBe('failed')
  })

  it('does not remember a held-back vote when the failed comment is published again', async () => {
    draft('d1', 'First')
    fake.failThreadWithBody = 'First'
    await publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'], 'approved')
    fake.failThreadWithBody = null
    fake.requests = []

    const retry = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'])

    expect(fake.requests).toEqual(['POST thread First'])
    expect(retry).toEqual({ results: [{ draftId: 'd1', ok: true, error: null }] })
  })

  it('keeps the published comments when Azure DevOps refuses the vote', async () => {
    draft('d1', 'First')
    fake.failVote = 'The Azure DevOps token lacks permission for this request.'

    const result = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'], 'rejected')

    expect(result.results).toEqual([{ draftId: 'd1', ok: true, error: null }])
    expect(result.vote).toEqual({
      vote: 'rejected',
      status: 'failed',
      error: 'The Azure DevOps token lacks permission for this request.'
    })
    expect(getStoredAzureDevOpsReviewDraft('d1')?.state).toBe('published')
  })

  it('sends one vote when the same publish arrives twice', async () => {
    draft('d1', 'First')
    let release = (): void => undefined
    fake.gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'], 'approved')
    const second = publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'], 'approved')
    await expect(second).rejects.toThrow('already being published')
    release()
    await first

    expect(writes()).toEqual(['POST thread First', `PUT reviewer ${ME} vote 10`])
  })

  it.each([
    ['their own pull request', { createdBy: { id: ME } }, 'your own pull request'],
    ['a completed pull request', { status: 'completed' }, 'closed'],
    ['an abandoned pull request', { status: 'abandoned' }, 'closed']
  ])('publishes nothing when the vote targets %s', async (_name, patch, message) => {
    draft('d1', 'First')
    fake.pullRequest = activePullRequest(patch)

    await expect(
      publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'], 'approved')
    ).rejects.toThrow(message)

    expect(writes()).toEqual([])
    expect(getStoredAzureDevOpsReviewDraft('d1')?.state).toBe('draft')
  })

  it('votes on a pull request from a fork', async () => {
    fake.pullRequest = activePullRequest({ forkSource: { repository: { id: 'fork' } } })

    const result = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, [], 'approved')

    expect(result.vote?.status).toBe('sent')
  })

  it('votes as the signed-in identity when it is not a reviewer yet', async () => {
    fake.pullRequest = activePullRequest({ reviewers: [] })

    await publishAzureDevOpsReviewDrafts(host, pullRequestKey, [], 'waiting-for-author')

    expect(writes()).toEqual([`PUT reviewer ${ME} vote -5`])
  })

  it('publishes comments as before when no vote is asked for', async () => {
    draft('d1', 'First')

    const result = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, ['d1'])

    // No identity or pull request lookup either: an older client costs no extra request.
    expect(fake.requests).toEqual(['POST thread First'])
    expect(result).toEqual({ results: [{ draftId: 'd1', ok: true, error: null }] })
  })
})
