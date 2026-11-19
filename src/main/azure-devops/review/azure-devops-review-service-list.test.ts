import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE as PAGE } from '../../../shared/azure-devops-review-list-pages'

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

type Fake = {
  /** Closed pull requests per repository name. */
  closed: Record<string, number>
  failingSkip: number | null
  requests: string[]
}

const { fake } = vi.hoisted(() => {
  const state: Fake = { closed: {}, failingSkip: null, requests: [] }
  return { fake: state }
})

vi.mock('./azure-devops-review-repos', () => ({
  collectAzureDevOpsReviewRepos: async () => [shop, docs],
  toAzureDevOpsReviewRepo: (repo: unknown) => repo
}))
vi.mock('../azure-devops-credentials', () => ({
  azureDevOpsOrganizationCredentialSource: () => 'token'
}))
vi.mock('./azure-devops-review-draft-store', () => ({
  countUnpublishedAzureDevOpsReviewDrafts: () => ({}),
  listStoredAzureDevOpsReviewDrafts: () => []
}))
vi.mock('./azure-devops-review-client', () => ({
  getAzureDevOpsReviewIdentity: async () => ({ id: 'me', displayName: 'Me', at: 0 }),
  resolveAzureDevOpsReviewRepository: async (target: { repository: string }) => ({
    id: `${target.repository}-id`,
    webUrl: `https://dev.azure.com/contoso/Web/_git/${target.repository}`
  }),
  listAzureDevOpsRepositoryPullRequests: async (
    target: { repository: string },
    status: string,
    page: { top: number; skip: number }
  ) => {
    fake.requests.push(`${target.repository} ${status} ${page.skip}`)
    if (fake.failingSkip === page.skip) {
      throw new Error('HTTP 503')
    }
    const count = status === 'completed' ? (fake.closed[target.repository] ?? 0) : 0
    return Array.from({ length: count }, (_, index) => ({
      pullRequestId: count - index,
      title: `Change ${count - index}`,
      status,
      creationDate: new Date(Date.UTC(2026, 0, 1) + (count - index) * 60_000).toISOString()
    })).slice(page.skip, page.skip + page.top)
  }
}))

import { listAzureDevOpsReviewPullRequests } from './azure-devops-review-service'

// The list as clients from before paging read it.
const LegacyList = z.strictObject({
  pullRequests: z.array(z.object({ key: z.string(), pullRequestId: z.number() })),
  repos: z.array(z.object({ key: z.string() })),
  errors: z.array(z.strictObject({ scope: z.string(), message: z.string() })),
  draftCounts: z.record(z.string(), z.number()),
  fetchedAt: z.number()
})

const host = { listRepos: () => [] }

beforeEach(() => {
  fake.closed = {}
  fake.failingSkip = null
  fake.requests = []
})

describe('listAzureDevOpsReviewPullRequests paging', () => {
  it('answers a list that fits with exactly the fields older clients know', async () => {
    fake.closed = { shop: 3 }
    const result = await listAzureDevOpsReviewPullRequests(host, 'completed')
    expect(LegacyList.safeParse(result).success).toBe(true)
    expect(result.pullRequests).toHaveLength(3)
  })

  it('names only the repositories whose list was cut off', async () => {
    fake.closed = { shop: PAGE + 10, docs: 5 }
    const result = await listAzureDevOpsReviewPullRequests(host, 'completed')
    expect(result.truncatedRepoKeys).toEqual([shop.key])
    expect(result.pullRequests).toHaveLength(PAGE + 5)
    expect(result.errors).toEqual([])
  })

  it('reads further pages only of the repository that has them', async () => {
    fake.closed = { shop: PAGE + 10, docs: 5 }
    const result = await listAzureDevOpsReviewPullRequests(host, 'completed', 2)
    expect(result.truncatedRepoKeys).toBeUndefined()
    expect(result.pullRequests).toHaveLength(PAGE + 15)
    expect(fake.requests.sort()).toEqual([
      'docs completed 0',
      'shop completed 0',
      `shop completed ${PAGE}`
    ])
  })

  it('keeps the first page of a repository whose second page failed and says why', async () => {
    fake.closed = { shop: 2 * PAGE + 10 }
    fake.failingSkip = PAGE
    const result = await listAzureDevOpsReviewPullRequests(host, 'completed', 3)
    expect(result.pullRequests).toHaveLength(PAGE)
    expect(result.truncatedRepoKeys).toEqual([shop.key])
    expect(result.errors).toEqual([{ scope: 'contoso/Web/shop', message: 'HTTP 503' }])
  })
})
