import { useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffSection } from '@/components/editor/diff-section-types'
import {
  EMPTY_GIT_BRANCH_ENTRIES,
  EMPTY_GIT_STATUS_ENTRIES,
  useCombinedDiffEntrySet,
  type CombinedDiffEntrySet
} from '@/components/editor/combined-diff/resolve-changes/use-combined-diff-entry-set'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import { toSnapshotDiffEntry, type SnapshotDiffEntry } from './snapshot-diff-entries'

export type CombinedDiffChange = GitStatusEntry | GitBranchChangeEntry

export type CombinedDiffSnapshots = {
  entries: SnapshotDiffEntry[]
  changeByKey: ReadonlyMap<string, CombinedDiffChange>
  entrySet: CombinedDiffEntrySet
}

/** The snapshot images among a diff's changes, each keyed back to its change. */
export function snapshotEntriesOfCombinedDiff(
  changes: readonly CombinedDiffChange[],
  isAllMode: boolean
): Pick<CombinedDiffSnapshots, 'entries' | 'changeByKey'> {
  const entries: SnapshotDiffEntry[] = []
  const changeByKey = new Map<string, CombinedDiffChange>()
  for (const change of changes) {
    // Why the area: in All Changes one path can be both committed and edited since.
    const key = `${'area' in change ? change.area : 'committed'}:${change.path}`
    const entry = toSnapshotDiffEntry({
      key,
      path: change.path,
      oldPath: change.oldPath,
      status: change.status,
      uncommitted: isAllMode && 'area' in change
    })
    if (entry && !changeByKey.has(key)) {
      entries.push(entry)
      changeByKey.set(key, change)
    }
  }
  return { entries, changeByKey }
}

/** Snapshot images of a combined diff tab: the same changes the tab lists, filtered. */
export function useCombinedDiffSnapshots(file: OpenFile): CombinedDiffSnapshots {
  const gitStatusEntries = useAppStore(
    (s) => s.gitStatusByWorktree[file.worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )
  const liveBranchEntries = useAppStore(
    (s) => s.gitBranchChangesByWorktree[file.worktreeId] ?? EMPTY_GIT_BRANCH_ENTRIES
  )
  // No sections here: the ref only lets the diff list keep rows it already resolved.
  const sectionsRef = useRef<DiffSection[]>([])
  const entrySet = useCombinedDiffEntrySet({
    file,
    gitStatusEntries,
    liveBranchEntries,
    sectionsRef
  })
  const snapshots = useMemo(
    () => snapshotEntriesOfCombinedDiff(entrySet.entries, entrySet.isAllMode),
    [entrySet.entries, entrySet.isAllMode]
  )
  return { ...snapshots, entrySet }
}
