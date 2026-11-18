// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewListResult,
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewRepo
} from '../../../../shared/azure-devops-review-types'
import { DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS } from '../../../../shared/azure-devops-review-filters'

const { openMock, listMock } = vi.hoisted(() => ({ openMock: vi.fn(), listMock: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    <T,>(selector: (state: { repos: [] }) => T): T => selector({ repos: [] }),
    {
      getState: () => ({})
    }
  )
}))
vi.mock('@/lib/azure-devops-review-page', () => ({ openAzureDevOpsPullRequestPage: openMock }))
vi.mock('@/lib/azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: listMock
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import AzureDevOpsPullRequestsPanel from './AzureDevOpsPullRequestsPanel'

function repo(repository: string): AzureDevOpsReviewRepo {
  return {
    key: `dev.azure.com/contoso/shop/${repository}`,
    organizationKey: 'dev.azure.com/contoso',
    organizationUrl: 'https://dev.azure.com/contoso',
    organizationLabel: 'contoso',
    project: 'Shop',
    repository,
    orcaRepoIds: ['r1']
  }
}

const app = repo('app')
const api = repo('api')

function pr(
  id: number,
  source: AzureDevOpsReviewRepo,
  patch: Partial<AzureDevOpsReviewPullRequest> = {}
): AzureDevOpsReviewPullRequest {
  return {
    key: `pr-${id}`,
    pullRequestId: id,
    title: `Change ${id}`,
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: source.organizationKey,
    organizationLabel: source.organizationLabel,
    project: source.project,
    repository: source.repository,
    repositoryId: source.repository,
    repoKey: source.key,
    author: { displayName: 'Ada', uniqueName: null },
    myVote: 'none',
    createdAt: '2026-10-01T00:00:00Z',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: '',
    ...patch
  }
}

const LIST: AzureDevOpsReviewListResult = {
  pullRequests: [
    pr(1, app, { reviewRequested: true }),
    pr(2, api, { reviewRequested: true }),
    pr(3, app, { createdByMe: true }),
    pr(4, api, { reviewRequested: true, myVote: 'approved' }),
    pr(5, api)
  ],
  repos: [app, api],
  errors: [],
  draftCounts: { 'pr-2': 3 },
  fetchedAt: Date.now()
}

function renderPanel(): void {
  render(
    <TooltipProvider>
      <AzureDevOpsPullRequestsPanel isVisible={false} />
    </TooltipProvider>
  )
}

const group = (name: string): HTMLElement => screen.getByRole('region', { name })
const shownGroups = (): (string | null)[] =>
  [...document.querySelectorAll('[data-review-group]')].map((entry) =>
    entry.getAttribute('data-review-group')
  )
const titles = (name: string): (string | null)[] =>
  within(group(name))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-medium')?.textContent ?? null)

describe('AzureDevOpsPullRequestsPanel groups', () => {
  beforeEach(() => {
    openMock.mockReset()
    useAzureDevOpsReviewStore.setState({
      list: LIST,
      filters: DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
      loading: false,
      error: null,
      openPullRequestKey: null
    })
    useAzureDevOpsAutoReview.setState({ unopenedKeys: new Set(['pr-1']) })
  })
  afterEach(cleanup)

  it('splits the list into three groups, each with its count', () => {
    renderPanel()

    expect(titles('Waiting for my review')).toEqual(['Change 1', 'Change 2'])
    expect(titles('My pull requests')).toEqual(['Change 3'])
    expect(titles('Other')).toEqual(['Change 4', 'Change 5'])
    expect(within(group('Waiting for my review')).getByRole('heading').textContent).toBe(
      'Waiting for my review2'
    )
    expect(within(group('My pull requests')).getByRole('heading').textContent).toBe(
      'My pull requests1'
    )
    expect(within(group('Other')).getByRole('heading').textContent).toBe('Other2')
  })

  it('narrows to one group with the quick filter and shows what each choice holds', async () => {
    renderPanel()
    const toggle = screen.getByRole('radiogroup', { name: 'Filter by my involvement' })
    expect(within(toggle).getByRole('radio', { name: 'All 5' })).toBeTruthy()

    await userEvent.setup().click(within(toggle).getByRole('radio', { name: 'Mine 1' }))

    expect(shownGroups()).toEqual(['mine'])
    expect(titles('My pull requests')).toEqual(['Change 3'])
    expect(screen.getByText('1 of 5')).toBeTruthy()
  })

  it('combines the quick filter with the repository filter', () => {
    useAzureDevOpsReviewStore.setState({
      filters: {
        ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
        involvement: 'awaiting-my-review',
        repo: api.key
      }
    })
    renderPanel()

    const toggle = screen.getByRole('radiogroup', { name: 'Filter by my involvement' })
    expect(within(toggle).getByRole('radio', { name: 'All 3' })).toBeTruthy()
    expect(within(toggle).getByRole('radio', { name: 'Waiting for me 1' })).toBeTruthy()
    expect(within(toggle).getByRole('radio', { name: 'Mine 0' })).toBeTruthy()
    expect(titles('Waiting for my review')).toEqual(['Change 2'])
  })

  it('combines the quick filter with the project and state filters', () => {
    const merged = pr(6, app, { createdByMe: true, status: 'completed' })
    const elsewhere = pr(7, { ...app, project: 'Tools' }, { createdByMe: true })
    const list = { ...LIST, pullRequests: [...LIST.pullRequests, merged, elsewhere] }
    const mineInShop = {
      ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
      involvement: 'mine' as const,
      project: 'dev.azure.com/contoso/shop'
    }

    useAzureDevOpsReviewStore.setState({ list, filters: mineInShop })
    renderPanel()
    expect(titles('My pull requests')).toEqual(['Change 3'])
    cleanup()

    useAzureDevOpsReviewStore.setState({ list, filters: { ...mineInShop, status: 'all' } })
    renderPanel()
    expect(titles('My pull requests')).toEqual(['Change 3', 'Change 6'])
  })

  it('offers to reset when the quick filter leaves nothing to show', async () => {
    useAzureDevOpsReviewStore.setState({
      filters: { ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS, involvement: 'mine', repo: api.key }
    })
    renderPanel()

    expect(screen.getByText('No pull requests match the filters.')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(shownGroups()).toEqual(['awaiting-my-review', 'mine', 'other'])
  })

  it('leads each row with the action that fits it', () => {
    renderPanel()
    const rows = within(group('Waiting for my review')).getAllByRole('listitem')

    expect(within(rows[0]).getByRole('button', { name: 'Start review' })).toBeTruthy()
    expect(within(rows[1]).getByRole('button', { name: 'Continue review' })).toBeTruthy()
    expect(within(group('My pull requests')).queryByRole('button', { name: /review/i })).toBeNull()
    expect(within(group('Other')).queryByRole('button', { name: /review/i })).toBeNull()
  })

  it('marks only the request that has not been opened yet, and opens it from its action', async () => {
    renderPanel()
    const rows = within(group('Waiting for my review')).getAllByRole('listitem')

    expect(within(rows[0]).getByText('New')).toBeTruthy()
    expect(within(rows[1]).queryByText('New')).toBeNull()

    await userEvent.setup().click(within(rows[0]).getByRole('button', { name: 'Start review' }))
    expect(openMock).toHaveBeenCalledWith('pr-1')
  })
})
