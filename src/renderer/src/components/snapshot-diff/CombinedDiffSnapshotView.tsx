import { useCallback, useLayoutEffect, useRef, type JSX } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor'
import { fetchCombinedDiffSection } from '@/components/editor/combined-diff/load-sections/fetch-combined-diff-section'
import { useCombinedDiffSnapshots } from './combined-diff-snapshot-entries'
import { snapshotImagesOfDiff, type SnapshotDiffEntry } from './snapshot-diff-entries'
import { SnapshotDiffView } from './SnapshotDiffView'

/** The snapshot images of a combined diff tab, loaded the way the tab loads its sections. */
export default function CombinedDiffSnapshotView({
  file,
  onClose
}: {
  file: OpenFile
  onClose: () => void
}): JSX.Element {
  const snapshots = useCombinedDiffSnapshots(file)
  const { entrySet } = snapshots
  // Why a ref: the loader must keep its identity while the tab record changes under it.
  const latestRef = useRef({ file, snapshots })
  useLayoutEffect(() => {
    latestRef.current = { file, snapshots }
  })
  const loadImages = useCallback(async (entry: SnapshotDiffEntry) => {
    const latest = latestRef.current
    const change = latest.snapshots.changeByKey.get(entry.key)
    if (!change) {
      return null
    }
    const set = latest.snapshots.entrySet
    // The diff's own loader, so SSH and runtime-owned worktrees resolve exactly as they do there.
    const result = await fetchCombinedDiffSection({
      branchCompare: set.branchCompare,
      commitCompare: set.commitCompare,
      entry: change,
      file: latest.file,
      isAllMode: set.isAllMode,
      isBranchMode: set.isBranchMode,
      isCommitMode: set.isCommitMode
    })
    return snapshotImagesOfDiff(result)
  }, [])

  // Committed revisions never change; anything touching the working tree can.
  const revisionKey =
    entrySet.isBranchMode && entrySet.branchCompare
      ? `${file.id}:${entrySet.branchCompare.compareVersion}`
      : entrySet.isCommitMode && entrySet.commitCompare
        ? `${file.id}:${entrySet.commitCompare.compareVersion}`
        : null
  const scopeLabel =
    (entrySet.isBranchMode || entrySet.isAllMode) && entrySet.branchCompare
      ? translate('snapshotDiff.scopeBase', 'compared with {{value0}}', {
          value0: entrySet.branchCompare.baseRef
        })
      : entrySet.isCommitMode && entrySet.commitCompare
        ? translate('snapshotDiff.scopeCommit', 'in commit {{value0}}', {
            value0: entrySet.commitCompare.compareRef
          })
        : translate('snapshotDiff.scopeUncommitted', 'uncommitted changes')

  return (
    <SnapshotDiffView
      entries={snapshots.entries}
      loadImages={loadImages}
      revisionKey={revisionKey}
      scopeLabel={scopeLabel}
      leading={
        <Button variant="ghost" size="xs" onClick={onClose}>
          <ArrowLeft className="size-3.5" />
          {translate('snapshotDiff.backToDiff', 'Back to diff')}
        </Button>
      }
    />
  )
}
