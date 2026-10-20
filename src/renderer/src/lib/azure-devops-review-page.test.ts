import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorktreeNavHistorySlice,
  setWorktreeNavActivator,
  setWorktreeNavViewActivator,
  type WorktreeNavHistorySlice
} from '@/store/slices/worktree-nav-history'
import type { AppState } from '@/store/types'

type TestState = WorktreeNavHistorySlice &
  Pick<AppState, 'folderWorkspaces' | 'activeView' | 'activeWorktreeId' | 'setActiveView'> & {
    worktreesByRepo: Record<string, { id: string }[]>
  }

const appStore = vi.hoisted(() => {
  const holder: { current?: StoreApi<TestState> } = {}
  return holder
})

function requireAppStore(): StoreApi<TestState> {
  if (!appStore.current) {
    throw new Error('test app store not created')
  }
  return appStore.current
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => requireAppStore().getState(),
    setState: (partial: Partial<TestState>) => requireAppStore().setState(partial)
  }
}))
vi.mock('./independent-terminals-view', () => ({
  closeIndependentTerminalsView: vi.fn()
}))
vi.mock('@/lib/azure-devops-review-client', () => ({
  listAzureDevOpsReviewPullRequests: vi.fn()
}))

import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import {
  closeAzureDevOpsPullRequestPage,
  openAzureDevOpsPullRequestPage,
  replayAzureDevOpsPullRequestPage
} from './azure-devops-review-page'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the slice reads only its own fields, folderWorkspaces and worktree ids, all present on TestState.
const createTestNavHistorySlice = createWorktreeNavHistorySlice as unknown as StateCreator<
  TestState,
  [],
  [],
  WorktreeNavHistorySlice
>

function createAppStore(): StoreApi<TestState> {
  return createStore<TestState>()((set, get, api) => ({
    worktreesByRepo: { repo: [{ id: 'wt-a' }, { id: 'wt-b' }] },
    folderWorkspaces: [],
    activeView: 'terminal',
    activeWorktreeId: 'wt-a',
    setActiveView: (activeView) => set({ activeView }),
    ...createTestNavHistorySlice(set, get, api)
  }))
}

describe('azure devops pull request page history', () => {
  let store: StoreApi<TestState>

  beforeEach(() => {
    store = createAppStore()
    appStore.current = store
    useAzureDevOpsReviewStore.setState({ openPullRequestKey: null })
    setWorktreeNavActivator((worktreeId) => {
      store.setState({ activeWorktreeId: worktreeId })
      closeAzureDevOpsPullRequestPage()
      return true
    })
    setWorktreeNavViewActivator((entry) => {
      if (typeof entry === 'object' && entry.kind === 'azure-devops-pull-request') {
        replayAzureDevOpsPullRequestPage(entry)
      }
    })
    store.getState().recordWorktreeVisit('wt-a')
  })

  it('lets Back return to the page after leaving it for a tab of the same workspace', () => {
    openAzureDevOpsPullRequestPage('pr-1')
    closeAzureDevOpsPullRequestPage()
    expect(useAzureDevOpsReviewStore.getState().openPullRequestKey).toBeNull()

    store.getState().goBackWorktree()
    expect(useAzureDevOpsReviewStore.getState().openPullRequestKey).toBe('pr-1')

    store.getState().goBackWorktree()
    expect(useAzureDevOpsReviewStore.getState().openPullRequestKey).toBeNull()
    expect(store.getState().worktreeNavHistoryIndex).toBe(0)

    store.getState().goForwardWorktree()
    expect(useAzureDevOpsReviewStore.getState().openPullRequestKey).toBe('pr-1')
  })

  it('records the workspace the page was opened over', () => {
    openAzureDevOpsPullRequestPage('pr-1')
    expect(store.getState().worktreeNavHistory).toEqual([
      'wt-a',
      {
        kind: 'azure-devops-pull-request',
        pullRequestKey: 'pr-1',
        worktreeId: 'wt-a'
      }
    ])
  })

  it('does not record a visit while replaying history', () => {
    openAzureDevOpsPullRequestPage('pr-1')
    closeAzureDevOpsPullRequestPage()
    const historyLength = store.getState().worktreeNavHistory.length
    store.getState().goBackWorktree()
    store.getState().goBackWorktree()
    expect(store.getState().worktreeNavHistory).toHaveLength(historyLength)
  })
})
