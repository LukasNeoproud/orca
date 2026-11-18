import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Summary = { status: string; baseRef: string }
type FakeState = {
  activeWorktreeId: string | null
  activeFileId: string | null
  gitBranchCompareSummaryByWorktree: Record<string, Summary | undefined>
  getKnownWorktreeById: (id: string) => { path: string } | undefined
  openBranchAllDiffs: ReturnType<typeof vi.fn>
  setRightSidebarTab: ReturnType<typeof vi.fn>
  setRightSidebarOpen: ReturnType<typeof vi.fn>
}

const { store, toastInfo } = vi.hoisted(() => {
  const listeners = new Set<(state: unknown) => void>()
  const holder: { state: unknown } = { state: null }
  return {
    store: {
      listeners,
      holder,
      getState: () => holder.state,
      subscribe: (listener: (state: unknown) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    toastInfo: vi.fn()
  }
})

vi.mock('@/store', () => ({ useAppStore: store }))
vi.mock('sonner', () => ({ toast: { info: toastInfo } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

import { openWorktreeSnapshotDiff } from './open-worktree-snapshot-diff'
import { useSnapshotDiffTabStore } from './snapshot-diff-tab-store'

const WORKTREE = 'repo::/work/shop'
const READY: Summary = { status: 'ready', baseRef: 'origin/main' }
let state: FakeState

function update(patch: Partial<FakeState>): void {
  state = { ...state, ...patch }
  store.holder.state = state
  // A Set tolerates the removals a listener makes while it is being walked.
  for (const listener of store.listeners) {
    listener(state)
  }
}

describe('openWorktreeSnapshotDiff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    store.listeners.clear()
    useSnapshotDiffTabStore.setState({ openTabIds: {} })
    state = {
      activeWorktreeId: WORKTREE,
      activeFileId: null,
      gitBranchCompareSummaryByWorktree: {},
      getKnownWorktreeById: () => ({ path: '/work/shop' }),
      // The real action makes the branch diff the active tab.
      openBranchAllDiffs: vi.fn(() => update({ activeFileId: 'branch-diff-tab' })),
      setRightSidebarTab: vi.fn(),
      setRightSidebarOpen: vi.fn()
    }
    store.holder.state = state
  })
  afterEach(() => vi.useRealTimers())

  it('opens the branch diff on its snapshots when the comparison is ready', () => {
    update({ gitBranchCompareSummaryByWorktree: { [WORKTREE]: READY } })

    openWorktreeSnapshotDiff(WORKTREE)

    expect(state.openBranchAllDiffs).toHaveBeenCalledWith(WORKTREE, '/work/shop', READY)
    expect(useSnapshotDiffTabStore.getState().openTabIds).toEqual({ 'branch-diff-tab': true })
    expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('shows Source Control to run the comparison, then opens once it is ready', () => {
    openWorktreeSnapshotDiff(WORKTREE)

    expect(state.setRightSidebarTab).toHaveBeenCalledWith('source-control')
    expect(state.setRightSidebarOpen).toHaveBeenCalledWith(true)
    expect(state.openBranchAllDiffs).not.toHaveBeenCalled()

    update({
      gitBranchCompareSummaryByWorktree: { [WORKTREE]: { status: 'loading', baseRef: 'main' } }
    })
    expect(state.openBranchAllDiffs).not.toHaveBeenCalled()

    update({ gitBranchCompareSummaryByWorktree: { [WORKTREE]: READY } })
    expect(state.openBranchAllDiffs).toHaveBeenCalledOnce()
    expect(useSnapshotDiffTabStore.getState().openTabIds).toEqual({ 'branch-diff-tab': true })
    expect(store.listeners.size).toBe(0)

    vi.runAllTimers()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('says so when the branch cannot be compared with a base', () => {
    update({
      gitBranchCompareSummaryByWorktree: {
        [WORKTREE]: { status: 'invalid-base', baseRef: 'gone' }
      }
    })

    openWorktreeSnapshotDiff(WORKTREE)

    expect(toastInfo).toHaveBeenCalledOnce()
    expect(state.openBranchAllDiffs).not.toHaveBeenCalled()
  })

  it('gives up with a message when no comparison arrives', () => {
    openWorktreeSnapshotDiff(WORKTREE)
    vi.advanceTimersByTime(20_000)

    expect(toastInfo).toHaveBeenCalledOnce()
    expect(store.listeners.size).toBe(0)
    update({ gitBranchCompareSummaryByWorktree: { [WORKTREE]: READY } })
    expect(state.openBranchAllDiffs).not.toHaveBeenCalled()
  })

  it('drops the request when the user switches to another worktree first', () => {
    openWorktreeSnapshotDiff(WORKTREE)
    update({ activeWorktreeId: 'repo::/work/other' })
    update({ gitBranchCompareSummaryByWorktree: { [WORKTREE]: READY } })
    vi.runAllTimers()

    expect(state.openBranchAllDiffs).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })
})
