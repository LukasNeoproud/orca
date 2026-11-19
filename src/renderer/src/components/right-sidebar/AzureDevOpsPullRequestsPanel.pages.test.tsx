// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES } from '../../../../shared/azure-devops-review-list-pages'
import type { AzureDevOpsReviewListResult } from '../../../../shared/azure-devops-review-types'
import { DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS } from '../../../../shared/azure-devops-review-filters'

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: { repos: { id: string }[] }) => T): T =>
    selector({ repos: [{ id: 'shop' }] })
}))
vi.mock('@/lib/azure-devops-review-page', () => ({ openAzureDevOpsPullRequestPage: vi.fn() }))
vi.mock('@/lib/azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: listMock
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import AzureDevOpsPullRequestsPanel from './AzureDevOpsPullRequestsPanel'

const repo = {
  key: 'dev.azure.com/contoso/web/shop',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'shop',
  orcaRepoIds: ['shop']
}

const NOTE = 'Only the newest pull requests of shop are listed.'
const LOAD = 'Load older pull requests'

function listed(patch: Partial<AzureDevOpsReviewListResult> = {}): AzureDevOpsReviewListResult {
  return {
    pullRequests: [],
    repos: [repo],
    errors: [],
    draftCounts: {},
    fetchedAt: Date.now(),
    ...patch
  }
}

async function show(): Promise<void> {
  render(
    <TooltipProvider>
      <AzureDevOpsPullRequestsPanel isVisible />
    </TooltipProvider>
  )
  await act(async () => {
    await Promise.resolve()
  })
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
    await Promise.resolve()
  })
}

describe('AzureDevOpsPullRequestsPanel paging', () => {
  beforeEach(() => {
    listMock.mockReset()
    useAzureDevOpsReviewStore.setState({
      list: null,
      filters: { ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS, status: 'all' },
      loading: false,
      error: null,
      pages: 1,
      openPullRequestKey: null,
      projectsSignature: null
    })
  })
  afterEach(cleanup)

  it('says nothing about older pull requests when the host reports none', async () => {
    // Also the answer of a host from before paging, which never sends the field.
    listMock.mockResolvedValue(listed())
    await show()
    expect(listMock).toHaveBeenCalledWith('all', 1)
    expect(screen.queryByText(NOTE)).toBeNull()
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
  })

  it('names the cut off repository and loads one more page on request', async () => {
    listMock.mockResolvedValueOnce(listed({ truncatedRepoKeys: [repo.key] }))
    listMock.mockResolvedValueOnce(listed())
    await show()
    expect(screen.getByRole('status').textContent).toContain(NOTE)

    await click(LOAD)
    expect(listMock).toHaveBeenLastCalledWith('all', 2)
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('keeps the loaded depth on a refresh and starts over in another status', async () => {
    listMock.mockResolvedValue(listed({ truncatedRepoKeys: [repo.key] }))
    await show()
    await click(LOAD)
    await click('Refresh pull requests')
    expect(listMock).toHaveBeenLastCalledWith('all', 2)

    await act(async () => {
      useAzureDevOpsReviewStore.getState().setFilters({ status: 'completed' })
      await Promise.resolve()
    })
    expect(listMock).toHaveBeenLastCalledWith('completed', 1)
  })

  it('stops offering more at the page limit and points to Azure DevOps', async () => {
    listMock.mockResolvedValue(listed({ truncatedRepoKeys: [repo.key] }))
    useAzureDevOpsReviewStore.setState({ pages: AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES })
    await show()
    expect(screen.getByRole('status').textContent).toContain('Open Azure DevOps to see older ones.')
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()

    await act(async () => {
      await useAzureDevOpsReviewStore.getState().loadMore()
    })
    expect(listMock).toHaveBeenCalledTimes(1)
  })
})
