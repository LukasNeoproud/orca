import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES,
  AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE as PAGE
} from '../../../shared/azure-devops-review-list-pages'
import type { RawReviewPullRequest } from './azure-devops-review-mappers'

type Request = { status: string; top: number; skip: number }

type Repository = {
  /** Pull requests newest first, as Azure DevOps orders them. */
  pullRequests: { pullRequestId: number; status: string }[]
  failing: ((request: Request) => boolean) | null
}

const { requests, repository } = vi.hoisted(() => {
  const recorded: Request[] = []
  const state: Repository = { pullRequests: [], failing: null }
  return { requests: recorded, repository: state }
})

vi.mock('./azure-devops-review-client', () => ({
  listAzureDevOpsRepositoryPullRequests: async (
    _target: unknown,
    status: string,
    page: { top: number; skip: number }
  ): Promise<RawReviewPullRequest[]> => {
    const request = { status, ...page }
    requests.push(request)
    if (repository.failing?.(request)) {
      throw new Error('HTTP 503')
    }
    return repository.pullRequests
      .filter((pullRequest) => status === 'all' || pullRequest.status === status)
      .slice(page.skip, page.skip + page.top)
  }
}))

import { listAzureDevOpsReviewPullRequestPages } from './azure-devops-review-pull-request-pages'

const target = {
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  project: 'Web',
  repository: 'app',
  repositoryId: 'repo'
}

/** `count` pull requests with descending ids starting at `firstId`. */
function series(firstId: number, count: number, status: string) {
  return Array.from({ length: count }, (_, index) => ({ pullRequestId: firstId - index, status }))
}

const ids = (pullRequests: RawReviewPullRequest[]): (number | null | undefined)[] =>
  pullRequests.map((pullRequest) => pullRequest.pullRequestId)

beforeEach(() => {
  requests.length = 0
  repository.pullRequests = []
  repository.failing = null
})

describe('listAzureDevOpsReviewPullRequestPages', () => {
  it('reads a list that fits in one request and reports it whole', async () => {
    repository.pullRequests = series(40, 40, 'active')
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'active')
    expect(result.pullRequests).toHaveLength(40)
    expect(result).toMatchObject({ truncated: false, error: null })
    expect(requests).toEqual([{ status: 'active', top: PAGE, skip: 0 }])
  })

  it('reads open pull requests past a full page to the last partial one', async () => {
    repository.pullRequests = series(1000, 2 * PAGE + 30, 'active')
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'active')
    expect(result.pullRequests).toHaveLength(2 * PAGE + 30)
    expect(result.truncated).toBe(false)
    expect(requests.map((request) => request.skip)).toEqual([0, PAGE, 2 * PAGE])
  })

  it('stops reading open pull requests at the page limit and says the list is cut off', async () => {
    repository.pullRequests = series(5000, 12 * PAGE, 'active')
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'active')
    expect(requests).toHaveLength(10)
    expect(result.pullRequests).toHaveLength(10 * PAGE)
    expect(result.truncated).toBe(true)
  })

  it('reads one page of closed pull requests and flags a full one as cut off', async () => {
    repository.pullRequests = series(900, PAGE + 50, 'completed')
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'completed')
    expect(result.pullRequests).toHaveLength(PAGE)
    expect(result).toMatchObject({ truncated: true, error: null })
    expect(requests).toEqual([{ status: 'completed', top: PAGE, skip: 0 }])
  })

  it('reads as many pages of closed pull requests as asked and ends on a partial page', async () => {
    repository.pullRequests = series(900, PAGE + 50, 'completed')
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'completed', 2)
    expect(result.pullRequests).toHaveLength(PAGE + 50)
    expect(result.truncated).toBe(false)
    expect(requests.map((request) => request.skip)).toEqual([0, PAGE])
  })

  it('still flags a history that ends exactly on a page boundary until the next page is read', async () => {
    repository.pullRequests = series(900, PAGE, 'abandoned')
    expect((await listAzureDevOpsReviewPullRequestPages(target, 'abandoned')).truncated).toBe(true)
    const next = await listAzureDevOpsReviewPullRequestPages(target, 'abandoned', 2)
    expect(next.pullRequests).toHaveLength(PAGE)
    expect(next.truncated).toBe(false)
  })

  it('never reads more pages than the limit, whatever a client asks for', async () => {
    repository.pullRequests = series(
      9000,
      (AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES + 5) * PAGE,
      'completed'
    )
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'completed', 9999)
    expect(requests).toHaveLength(AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES)
    expect(result.truncated).toBe(true)
  })

  it('lists under All every open pull request that Active lists, however old', async () => {
    // Two open pull requests older than more than a page of closed ones.
    repository.pullRequests = [
      ...series(1000, PAGE + 20, 'completed'),
      { pullRequestId: 12, status: 'active' },
      { pullRequestId: 11, status: 'active' }
    ]
    const active = await listAzureDevOpsReviewPullRequestPages(target, 'active')
    requests.length = 0
    const all = await listAzureDevOpsReviewPullRequestPages(target, 'all')
    expect(ids(active.pullRequests)).toEqual([12, 11])
    expect(ids(all.pullRequests)).toEqual(expect.arrayContaining([12, 11]))
    expect(all.pullRequests).toHaveLength(PAGE + 2)
    expect(all.truncated).toBe(true)
    expect(requests).toEqual([
      { status: 'active', top: PAGE, skip: 0 },
      { status: 'all', top: PAGE, skip: 0 }
    ])
  })

  it('lists a pull request once when both queries of All return it', async () => {
    repository.pullRequests = [
      { pullRequestId: 3, status: 'active' },
      { pullRequestId: 2, status: 'completed' },
      { pullRequestId: 1, status: 'active' }
    ]
    const all = await listAzureDevOpsReviewPullRequestPages(target, 'all')
    expect(ids(all.pullRequests).sort()).toEqual([1, 2, 3])
    expect(all.truncated).toBe(false)
  })

  it('keeps the first page when the second one fails, and reports both facts', async () => {
    repository.pullRequests = series(900, 3 * PAGE, 'completed')
    repository.failing = (request) => request.skip === PAGE
    const result = await listAzureDevOpsReviewPullRequestPages(target, 'completed', 3)
    expect(result.pullRequests).toHaveLength(PAGE)
    expect(result.truncated).toBe(true)
    expect(result.error).toEqual(new Error('HTTP 503'))
    expect(requests).toHaveLength(2)
  })

  it('fails when the first page fails', async () => {
    repository.failing = () => true
    await expect(listAzureDevOpsReviewPullRequestPages(target, 'all')).rejects.toThrow('HTTP 503')
  })
})
