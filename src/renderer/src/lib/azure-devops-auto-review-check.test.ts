import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewListResult,
  AzureDevOpsReviewPullRequest
} from '../../../shared/azure-devops-review-types'

const { listMock, toastMock, dismissMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  toastMock: vi.fn(),
  dismissMock: vi.fn()
}))

vi.mock('./azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: listMock
}))
vi.mock('sonner', () => ({ toast: Object.assign(toastMock, { dismiss: dismissMock }) }))

import { checkAzureDevOpsReviewOffers } from './azure-devops-auto-review-check'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'

function pullRequest(key: string): AzureDevOpsReviewPullRequest {
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
    createdAt: '',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: ''
  }
}

function list(keys: string[], errors = 0): AzureDevOpsReviewListResult {
  return {
    pullRequests: keys.map(pullRequest),
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
    useAzureDevOpsAutoReview.setState({ handledKeys: null })
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
})
