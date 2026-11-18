// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AzureDevOpsReviewListResult } from '../../../../shared/azure-devops-review-types'
import { DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS } from '../../../../shared/azure-devops-review-filters'

type AppState = { repos: { id: string }[] }

const { listMock, appStore } = vi.hoisted(() => {
  let state: AppState = { repos: [] }
  const listeners = new Set<() => void>()
  return {
    listMock: vi.fn(),
    appStore: {
      getState: (): AppState => state,
      setState: (next: AppState): void => {
        state = next
        listeners.forEach((listener) => listener())
      },
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  }
})

vi.mock('@/store', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useAppStore: <T,>(selector: (state: AppState) => T): T =>
      useSyncExternalStore(appStore.subscribe, () => selector(appStore.getState()))
  }
})
vi.mock('@/lib/azure-devops-review-page', () => ({ openAzureDevOpsPullRequestPage: vi.fn() }))
vi.mock('@/lib/azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: listMock
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import AzureDevOpsPullRequestsPanel from './AzureDevOpsPullRequestsPanel'

const EMPTY: AzureDevOpsReviewListResult = {
  pullRequests: [],
  repos: [],
  errors: [],
  draftCounts: {},
  fetchedAt: 0
}

function panel(isVisible: boolean): React.JSX.Element {
  return (
    <TooltipProvider>
      <AzureDevOpsPullRequestsPanel isVisible={isVisible} />
    </TooltipProvider>
  )
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AzureDevOpsPullRequestsPanel project changes', () => {
  beforeEach(() => {
    listMock.mockReset()
    listMock.mockImplementation(async () => ({ ...EMPTY, fetchedAt: Date.now() }))
    appStore.setState({ repos: [{ id: 'shop' }] })
    useAzureDevOpsReviewStore.setState({
      list: null,
      filters: DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
      loading: false,
      error: null,
      openPullRequestKey: null,
      projectsSignature: null
    })
  })
  afterEach(cleanup)

  it('reloads the list when a project is added or removed', async () => {
    render(panel(true))
    await settle()
    expect(listMock).toHaveBeenCalledTimes(1)

    act(() => appStore.setState({ repos: [{ id: 'shop' }, { id: 'tools' }] }))
    await settle()
    expect(listMock).toHaveBeenCalledTimes(2)

    act(() => appStore.setState({ repos: [{ id: 'tools' }] }))
    await settle()
    expect(listMock).toHaveBeenCalledTimes(3)
    expect(screen.queryByText('Pull requests are not loaded yet.')).toBeNull()
  })

  it('does not reload for an unrelated store change or a reordering', async () => {
    appStore.setState({ repos: [{ id: 'shop' }, { id: 'tools' }] })
    render(panel(true))
    await settle()

    act(() => appStore.setState({ repos: [{ id: 'tools' }, { id: 'shop' }] }))
    await settle()
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('reloads on the next showing after a project changed while the panel was closed', async () => {
    const view = render(panel(true))
    await settle()
    view.unmount()

    act(() => appStore.setState({ repos: [{ id: 'shop' }, { id: 'tools' }] }))
    expect(listMock).toHaveBeenCalledTimes(1)

    render(panel(true))
    await settle()
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})
