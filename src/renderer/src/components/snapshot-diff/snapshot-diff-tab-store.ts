import { create } from 'zustand'

type SnapshotDiffTabState = {
  /** Combined diff tabs currently showing their snapshots instead of their sections. */
  openTabIds: Record<string, true>
  setSnapshotsOpen: (tabId: string, open: boolean) => void
}

// Why its own store: the snapshot view is a mode of an existing diff tab, so
// it needs no tab type, persistence or session sync of its own.
export const useSnapshotDiffTabStore = create<SnapshotDiffTabState>((set) => ({
  openTabIds: {},
  setSnapshotsOpen: (tabId, open) =>
    set((state) => {
      if (Boolean(state.openTabIds[tabId]) === open) {
        return state
      }
      const openTabIds = { ...state.openTabIds }
      if (open) {
        openTabIds[tabId] = true
      } else {
        delete openTabIds[tabId]
      }
      return { openTabIds }
    })
}))
