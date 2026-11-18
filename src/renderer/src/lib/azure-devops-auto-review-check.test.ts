import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewListResult,
  AzureDevOpsReviewPullRequest
} from '../../../shared/azure-devops-review-types'

const { listMock, toastMock, dismissMock, announceMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  toastMock: vi.fn(),
  dismissMock: vi.fn(),
  announceMock: vi.fn()
}))

vi.mock('./azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: listMock
}))
vi.mock('sonner', () => ({ toast: Object.assign(toastMock, { dismiss: dismissMock }) }))
vi.mock('./azure-devops-review-request-notification', () => ({
  announceNewReviewRequests: announceMock
}))

import { checkAzureDevOpsReviewOffers } from './azure-devops-auto-review-check'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'

function pullRequest(
  key: string,
  patch: Partial<AzureDevOpsReviewPullRequest> = {}
): AzureDevOpsReviewPullRequest {
  return {
    key,
    pullRequestId: 7,
    title: 'Change',
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: 'org',
    organizationLabel: 'org',
    project: 'proj',
    repository: 'app',
    repositoryId: 'repo',
    repoKey: 'org+repo',
    author: { displayName: 'Author', uniqueName: null },
    myVote: 'none',
    reviewRequested: true,
    createdAt: '',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: '',
    ...patch
  }
}

function list(keys: string[], errors = 0): AzureDevOpsReviewListResult {
  return {
    pullRequests: keys.map((key) => pullRequest(key)),
    repos: [],
    errors: Array.from({ length: errors }, () => ({ scope: 'org', message: 'offline' })),
    draftCounts: {},
    fetchedAt: 0
  }
}

const offeredIds = (): string[] => toastMock.mock.calls.map((call) => call[1].id)

describe('checkAzureDevOpsReviewOffers', () => {
  beforeEach(() => {
    listMock.mockReset()
    toastMock.mockReset()
    dismissMock.mockReset()
    announceMock.mockReset()
    useAzureDevOpsAutoReview.setState({
      handledKeys: null,
      unopenedKeys: new Set(),
      announcedKeys: new Set()
    })
  })

  it('learns the open pull requests first, then offers only new ones once', async () => {
    listMock.mockResolvedValueOnce(list(['old']))
    await checkAzureDevOpsReviewOffers()
    expect(toastMock).not.toHaveBeenCalled()

    listMock.mockResolvedValue(list(['old', 'new']))
    await checkAzureDevOpsReviewOffers()
    await checkAzureDevOpsReviewOffers()
    expect(offeredIds()).toEqual(['azure-devops-auto-review:new'])
  })

  it('remembers an offer dismissed with its button', async () => {
    useAzureDevOpsAutoReview.setState({ handledKeys: new Set() })
    listMock.mockResolvedValue(list(['a']))
    await checkAzureDevOpsReviewOffers()
    toastMock.mock.calls[0][1].cancel.onClick()
    expect(useAzureDevOpsAutoReview.getState().handledKeys?.has('a')).toBe(true)
  })

  it('does not learn a baseline from a list that failed for some organization', async () => {
    listMock.mockResolvedValueOnce(list(['old'], 1))
    await checkAzureDevOpsReviewOffers()
    expect(useAzureDevOpsAutoReview.getState().handledKeys).toBeNull()
  })
  it('marks a new review request unopened and hands it over to be announced', async () => {
    useAzureDevOpsAutoReview.setState({ handledKeys: new Set(['old']) })
    listMock.mockResolvedValue(list(['old', 'new']))
    await checkAzureDevOpsReviewOffers()

    expect([...useAzureDevOpsAutoReview.getState().unopenedKeys]).toEqual(['new'])
    expect(announceMock.mock.calls[0][0].map((pr: AzureDevOpsReviewPullRequest) => pr.key)).toEqual(
      ['new']
    )
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('does not mark a request again once the user opened it', async () => {
    useAzureDevOpsAutoReview.setState({ handledKeys: new Set() })
    listMock.mockResolvedValue(list(['new']))
    await checkAzureDevOpsReviewOffers()
    useAzureDevOpsAutoReview.getState().markOpened('new')
    await checkAzureDevOpsReviewOffers()

    expect(useAzureDevOpsAutoReview.getState().unopenedKeys.size).toBe(0)
  })

  it('announces a fork without offering an AI review for it', async () => {
    useAzureDevOpsAutoReview.setState({ handledKeys: new Set() })
    listMock.mockResolvedValue({
      ...list([]),
      pullRequests: [pullRequest('fork', { isFork: true })]
    })
    await checkAzureDevOpsReviewOffers()

    expect(announceMock.mock.calls[0][0]).toHaveLength(1)
    expect([...useAzureDevOpsAutoReview.getState().unopenedKeys]).toEqual(['fork'])
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('forgets the marks of a pull request that left the list', async () => {
    useAzureDevOpsAutoReview.setState({
      handledKeys: new Set(),
      unopenedKeys: new Set(['gone', 'kept']),
      announcedKeys: new Set(['gone', 'kept'])
    })
    listMock.mockResolvedValue(list(['kept']))
    await checkAzureDevOpsReviewOffers()

    expect([...useAzureDevOpsAutoReview.getState().unopenedKeys]).toEqual(['kept'])
    expect([...useAzureDevOpsAutoReview.getState().announcedKeys]).toEqual(['kept'])
  })
})
