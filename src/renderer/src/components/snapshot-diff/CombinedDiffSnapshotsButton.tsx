import type { JSX } from 'react'
import { Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor'
import { useCombinedDiffSnapshots } from './combined-diff-snapshot-entries'
import { useSnapshotDiffTabStore } from './snapshot-diff-tab-store'

/** Toolbar entry of a combined diff; absent while the diff changes no snapshot image. */
export function CombinedDiffSnapshotsButton({ file }: { file: OpenFile }): JSX.Element | null {
  const { entries } = useCombinedDiffSnapshots(file)
  const setSnapshotsOpen = useSnapshotDiffTabStore((s) => s.setSnapshotsOpen)
  if (entries.length === 0) {
    return null
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => setSnapshotsOpen(file.id, true)}
    >
      <Images className="size-3.5" />
      {translate('snapshotDiff.openCount', 'Snapshots ({{value0}})', {
        value0: entries.length
      })}
    </Button>
  )
}
