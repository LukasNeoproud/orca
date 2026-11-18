import { create } from 'zustand'

type TodoOverviewState = {
  /** Workspaces whose Contents view shows TODO and FIXME instead of text search; session only. */
  openByWorktree: Record<string, true>
  changedOnlyByWorktree: Record<string, true>
  setOpen: (worktreeId: string, open: boolean) => void
  setChangedOnly: (worktreeId: string, changedOnly: boolean) => void
}

function withFlag(record: Record<string, true>, key: string, on: boolean): Record<string, true> {
  if (on === Boolean(record[key])) {
    return record
  }
  const next = { ...record }
  if (on) {
    next[key] = true
  } else {
    delete next[key]
  }
  return next
}

// Why: kept out of the persisted UI state and the paired-client contract so older clients and
// hosts never see a value they do not know.
export const useTodoOverviewStore = create<TodoOverviewState>((set) => ({
  openByWorktree: {},
  changedOnlyByWorktree: {},
  setOpen: (worktreeId, open) =>
    set((state) => ({ openByWorktree: withFlag(state.openByWorktree, worktreeId, open) })),
  setChangedOnly: (worktreeId, changedOnly) =>
    set((state) => ({
      changedOnlyByWorktree: withFlag(state.changedOnlyByWorktree, worktreeId, changedOnly)
    }))
}))

export function useTodoOverviewOpen(worktreeId: string | null): boolean {
  return useTodoOverviewStore((state) => (worktreeId ? !!state.openByWorktree[worktreeId] : false))
}
