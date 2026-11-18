import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useSnapshotDiffTabStore } from './snapshot-diff-tab-store'

// Covers one branch comparison over SSH, which the runtime itself caps at 15s.
const COMPARE_WAIT_MS = 20_000

let cancelPendingOpen: (() => void) | null = null

type CompareOutcome = 'ready' | 'pending' | 'unavailable'

function compareOutcome(worktreeId: string): CompareOutcome {
  const state = useAppStore.getState()
  const summary = state.gitBranchCompareSummaryByWorktree[worktreeId]
  if (!summary || summary.status === 'loading') {
    return 'pending'
  }
  return summary.status === 'ready' && state.getKnownWorktreeById(worktreeId)?.path
    ? 'ready'
    : 'unavailable'
}

function openComparedSnapshots(worktreeId: string): void {
  const state = useAppStore.getState()
  const summary = state.gitBranchCompareSummaryByWorktree[worktreeId]
  const worktreePath = state.getKnownWorktreeById(worktreeId)?.path
  if (!summary || !worktreePath) {
    return
  }
  state.openBranchAllDiffs(worktreeId, worktreePath, summary)
  // The branch diff just opened is the active tab; its snapshots replace its sections.
  const tabId = useAppStore.getState().activeFileId
  if (tabId) {
    useSnapshotDiffTabStore.getState().setSnapshotsOpen(tabId, true)
  }
}

function settle(worktreeId: string, outcome: Exclude<CompareOutcome, 'pending'>): void {
  if (outcome === 'ready') {
    openComparedSnapshots(worktreeId)
  } else {
    reportUnavailable()
  }
}

function reportUnavailable(): void {
  toast.info(
    translate(
      'snapshotDiff.compareUnavailable',
      'Snapshots need a comparison of this branch with its base, and none is available.'
    )
  )
}

/**
 * Opens the worktree's branch diff on its snapshots. The comparison belongs to
 * Source Control, so when there is none yet that panel is shown to run it.
 */
export function openWorktreeSnapshotDiff(worktreeId: string): void {
  cancelPendingOpen?.()
  const first = compareOutcome(worktreeId)
  if (first !== 'pending') {
    settle(worktreeId, first)
    return
  }
  const state = useAppStore.getState()
  state.setRightSidebarTab('source-control')
  state.setRightSidebarOpen(true)

  const stop = (): void => {
    clearTimeout(timer)
    unsubscribe()
    cancelPendingOpen = null
  }
  const timer = setTimeout(() => {
    stop()
    reportUnavailable()
  }, COMPARE_WAIT_MS)
  const unsubscribe = useAppStore.subscribe((next) => {
    // The user moved on; opening a tab in another worktree now would be a surprise.
    if (next.activeWorktreeId !== worktreeId) {
      stop()
      return
    }
    const outcome = compareOutcome(worktreeId)
    if (outcome !== 'pending') {
      // Why stop first: opening the tab writes to this store and would re-enter the listener.
      stop()
      settle(worktreeId, outcome)
    }
  })
  cancelPendingOpen = stop
}
