import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawReviewPullRequest } from './azure-devops-review-mappers'

const shop = {
  key: 'dev.azure.com/contoso/web/shop',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'shop',
  orcaRepoIds: ['r1']
}
const docs = { ...shop, key: 'dev.azure.com/contoso/web/docs', repository: 'docs' }
const tool = {
  ...shop,
  key: 'dev.azure.com/fabrikam/tools/tool',
  organizationKey: 'dev.azure.com/fabrikam',
  organizationUrl: 'https://dev.azure.com/fabrikam',
  organizationLabel: 'fabrikam',
  project: 'Tools',
  repository: 'tool'
}

type Sent = { method: string; path: string; search: URLSearchParams }

type Fake = {
  sources: unknown[]
  connected: Set<string>
  sent: Sent[]
  /** Raw pull requests per `${project} ${status}`. */
  lists: Record<string, unknown[]>
  /** Path fragments that answer HTTP 503. */
  failing: string[]
}

const { fake } = vi.hoisted(() => {
  const state: Fake = { sources: [], connected: new Set(), sent: [], lists: {}, failing: [] }
  return { fake: state }
})

vi.mock('./azure-devops-review-repos', () => ({
  collectAzureDevOpsReviewRepos: async () => fake.sources
}))
vi.mock('../azure-devops-credentials', () => ({
  azureDevOpsOrganizationCredentialSource: (key: string) =>
    fake.connected.has(key) ? 'connection' : null,
  resolveAzureDevOpsConnectionAuthHeaders: async () => ({ Authorization: 'Basic test' })
}))

import { forgetAzureDevOpsReviewOrganization } from './azure-devops-review-client'
import { refreshAzureDevOpsWorkFacts } from './azure-devops-work-facts-refresh'
import { AzureDevOpsWorkFactsStore } from './azure-devops-work-facts-store'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const host = { listRepos: () => [] }

function mine(id: number, repository: string, extra: Partial<RawReviewPullRequest> = {}) {
  return {
    pullRequestId: id,
    title: `Change ${id}`,
    status: 'active',
    creationDate: '2026-11-16T09:00:00Z',
    createdBy: { id: 'me-id' },
    repository: { id: `${repository}-id` },
    lastMergeSourceCommit: { commitId: `head-${id}` },
    sourceRefName: `refs/heads/feature/${id}`,
    targetRefName: 'refs/heads/main',
    ...extra
  }
}

function answer(url: URL): unknown {
  const path = url.pathname
  if (path.endsWith('/_apis/connectionData')) {
    return { authenticatedUser: { id: 'me-id' } }
  }
  const repository = /\/_apis\/git\/repositories\/([^/]+)$/.exec(path)
  if (repository) {
    return { id: `${repository[1]}-id`, webUrl: `https://example.test/_git/${repository[1]}` }
  }
  if (path.endsWith('/_apis/git/pullrequests')) {
    const project = path.split('/')[2]
    return {
      value: fake.lists[`${project} ${url.searchParams.get('searchCriteria.status')}`] ?? []
    }
  }
  if (path.endsWith('/threads')) {
    return {
      value: [
        {
          id: 1,
          status: 'active',
          comments: [{ id: 1, author: { id: 'ada' }, publishedDate: '2026-11-18T09:00:00Z' }]
        }
      ]
    }
  }
  if (path.endsWith('/iterations')) {
    return { value: [{ id: 1, createdDate: '2026-11-17T09:00:00Z' }] }
  }
  throw new Error(`unexpected request ${path}`)
}

beforeEach(() => {
  fake.sources = [shop, docs]
  fake.connected = new Set([shop.organizationKey, tool.organizationKey])
  fake.sent = []
  fake.lists = {}
  fake.failing = []
  forgetAzureDevOpsReviewOrganization(shop.organizationKey)
  forgetAzureDevOpsReviewOrganization(tool.organizationKey)
  vi.stubGlobal('fetch', async (input: URL, init?: RequestInit) => {
    const url = new URL(String(input))
    fake.sent.push({ method: init?.method ?? 'GET', path: url.pathname, search: url.searchParams })
    if (fake.failing.some((fragment) => url.pathname.includes(fragment))) {
      return new Response('{}', { status: 503 })
    }
    return Response.json(answer(url))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function detailRequests(): Sent[] {
  return fake.sent.filter((sent) => /\/(threads|iterations)$/.test(sent.path))
}

describe('refreshAzureDevOpsWorkFacts', () => {
  it('reads the reviewers, last version, open threads and last feedback of the open pull requests', async () => {
    fake.lists['Web active'] = [
      mine(7, 'shop', {
        reviewers: [
          { id: 'ada', displayName: 'Ada', vote: -5, isRequired: true },
          { id: 'bob', displayName: 'Bob', vote: 10 }
        ]
      })
    ]
    const store = new AzureDevOpsWorkFactsStore()
    const round = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(round).toEqual({ failed: false, detailRequests: 2, deferred: 0 })
    const { pullRequests, unknownRepos } = store.snapshot(NOW)
    expect(unknownRepos).toEqual([])
    expect(pullRequests).toHaveLength(1)
    expect(pullRequests[0]).toMatchObject({
      pullRequestId: 7,
      repoKey: shop.key,
      createdByMe: true,
      workFacts: {
        reviewers: [
          { name: 'Ada', vote: 'waiting-for-author', required: true },
          { name: 'Bob', vote: 'approved', required: false }
        ],
        mergedAt: null,
        mergeCommit: null,
        activity: {
          lastVersionAt: '2026-11-17T09:00:00Z',
          unresolvedThreads: 1,
          lastFeedbackAt: '2026-11-18T09:00:00Z'
        }
      }
    })
  })

  it('knows the merge time and the commit a squash left on the target branch', async () => {
    fake.lists['Web completed'] = [
      mine(5, 'docs', {
        status: 'completed',
        closedDate: '2026-11-19T08:00:00Z',
        lastMergeSourceCommit: { commitId: 'branch-head' },
        lastMergeCommit: { commitId: 'squash-on-main' }
      }),
      mine(4, 'docs', { status: 'completed', closedDate: '2026-06-01T08:00:00Z' })
    ]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    const { pullRequests } = store.snapshot(NOW)
    // The one merged half a year ago is no longer followed.
    expect(pullRequests.map((pr) => pr.pullRequestId)).toEqual([5])
    expect(pullRequests[0].workFacts).toEqual({
      reviewers: [],
      mergedAt: '2026-11-19T08:00:00Z',
      mergeCommit: 'squash-on-main'
    })
    // A completed pull request costs no thread or iteration request.
    expect(detailRequests()).toEqual([])
  })

  it('asks only for the pull requests of the signed-in user, once per project, and writes nothing', async () => {
    fake.sources = [shop, docs, tool]
    fake.lists['Web active'] = [mine(1, 'shop'), mine(2, 'docs'), mine(3, 'elsewhere')]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW + 15 * 60_000 })
    expect(fake.sent.length).toBeGreaterThan(10)
    expect(fake.sent.filter((sent) => sent.method !== 'GET')).toEqual([])
    const lists = fake.sent.filter((sent) => sent.path.endsWith('/_apis/git/pullrequests'))
    // Two rounds, two projects, open and completed.
    expect(lists).toHaveLength(8)
    expect(lists.every((sent) => sent.search.get('searchCriteria.creatorId') === 'me-id')).toBe(
      true
    )
    // A repository Orca does not have is not followed.
    expect(store.snapshot(NOW + 15 * 60_000).pullRequests.map((pr) => pr.pullRequestId)).toEqual([
      2, 1
    ])
  })

  it('reads iterations again only after the source commit moved', async () => {
    fake.lists['Web active'] = [mine(7, 'shop')]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    fake.sent = []
    const second = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(second.detailRequests).toBe(1)
    expect(detailRequests().map((sent) => sent.path.split('/').pop())).toEqual(['threads'])
    expect(store.snapshot(NOW).pullRequests[0].workFacts?.activity?.lastVersionAt).toBe(
      '2026-11-17T09:00:00Z'
    )
    fake.lists['Web active'] = [mine(7, 'shop', { lastMergeSourceCommit: { commitId: 'new' } })]
    const third = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(third.detailRequests).toBe(2)
  })

  it('stops at the request budget and reads the rest in the next round, changed ones first', async () => {
    fake.lists['Web active'] = Array.from({ length: 20 }, (_, index) => mine(index + 1, 'shop'))
    const store = new AzureDevOpsWorkFactsStore()
    const first = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(first).toEqual({ failed: false, detailRequests: 30, deferred: 5 })
    expect(detailRequests()).toHaveLength(30)
    const unread = (): number =>
      store.snapshot(NOW).pullRequests.filter((pr) => !pr.workFacts?.activity).length
    expect(unread()).toBe(5)

    fake.sent = []
    const second = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    // The five unread ones come first at two requests each; the fifteen re-reads cost one each.
    expect(second).toEqual({ failed: false, detailRequests: 25, deferred: 0 })
    expect(
      detailRequests()
        .slice(0, 10)
        .every((sent) => /pullRequests\/(1[6-9]|20)\//.test(sent.path))
    ).toBe(true)
    expect(unread()).toBe(0)
  })

  it('does not read the threads of drafts', async () => {
    fake.lists['Web active'] = [mine(7, 'shop', { isDraft: true })]
    const store = new AzureDevOpsWorkFactsStore()
    const round = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(round.detailRequests).toBe(0)
    expect(store.snapshot(NOW).pullRequests[0].workFacts).not.toHaveProperty('activity')
  })

  it('keeps what it read while a failed source is within its validity, then calls it unknown', async () => {
    fake.lists['Web active'] = [mine(7, 'shop')]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })

    fake.failing = ['/_apis/git/pullrequests']
    const failed = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW + 15 * 60_000 })
    expect(failed.failed).toBe(true)
    const within = store.snapshot(NOW + 15 * 60_000)
    expect(within.unknownRepos).toEqual([])
    expect(within.pullRequests[0].workFacts?.activity?.unresolvedThreads).toBe(1)

    const expired = store.snapshot(NOW + 31 * 60_000)
    expect(expired.pullRequests).toEqual([])
    expect(expired.unknownRepos).toEqual([
      { repoKey: docs.key, reason: 'source-failed' },
      { repoKey: shop.key, reason: 'source-failed' }
    ])
  })

  it('keeps the activity it has when the threads of one pull request fail', async () => {
    fake.lists['Web active'] = [mine(7, 'shop')]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    fake.failing = ['/threads']
    const round = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(round.failed).toBe(true)
    expect(store.snapshot(NOW).pullRequests[0].workFacts?.activity?.unresolvedThreads).toBe(1)
  })

  it('sends nothing for an organization without a connection and says why', async () => {
    fake.sources = [shop, tool]
    fake.connected = new Set([shop.organizationKey])
    const store = new AzureDevOpsWorkFactsStore()
    const round = await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(round.failed).toBe(false)
    expect(fake.sent.some((sent) => sent.path.startsWith('/fabrikam'))).toBe(false)
    expect(store.snapshot(NOW).unknownRepos).toEqual([
      { repoKey: tool.key, reason: 'not-connected' }
    ])
  })

  it('forgets pull requests that closed and repositories Orca no longer has', async () => {
    fake.lists['Web active'] = [mine(7, 'shop')]
    const store = new AzureDevOpsWorkFactsStore()
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    const key = store.snapshot(NOW).pullRequests[0].key
    expect(store.storedActivity(key)).toBeDefined()
    fake.lists['Web active'] = []
    fake.sources = [docs]
    await refreshAzureDevOpsWorkFacts(host, store, { nowMs: NOW })
    expect(store.storedActivity(key)).toBeUndefined()
    expect(store.snapshot(NOW)).toEqual({ pullRequests: [], unknownRepos: [] })
  })
})
