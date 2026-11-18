import { Suspense, useEffect, type JSX, type ReactNode } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { useSnapshotDiffTabStore } from './snapshot-diff-tab-store'

const CombinedDiffSnapshotView = lazy(() => import('./CombinedDiffSnapshotView'))

/** Shows a combined diff tab's snapshots in place of its sections while that mode is on. */
export function CombinedDiffSnapshotSwitch({
  file,
  children
}: {
  file: OpenFile
  children: ReactNode
}): JSX.Element {
  const open = useSnapshotDiffTabStore((s) => Boolean(s.openTabIds[file.id]))
  const setSnapshotsOpen = useSnapshotDiffTabStore((s) => s.setSnapshotsOpen)
  const tabId = file.id

  useEffect(
    () => () => {
      // Why on unmount: a closed tab must not reopen in snapshot mode under the same id.
      if (!useAppStore.getState().openFiles.some((openFile) => openFile.id === tabId)) {
        setSnapshotsOpen(tabId, false)
      }
    },
    [setSnapshotsOpen, tabId]
  )

  if (!open) {
    return <>{children}</>
  }
  return (
    <Suspense fallback={null}>
      <CombinedDiffSnapshotView file={file} onClose={() => setSnapshotsOpen(tabId, false)} />
    </Suspense>
  )
}
