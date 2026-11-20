import { useState, type JSX, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { STATUS_COLORS, STATUS_LABELS } from '@/components/right-sidebar/status-display'
import {
  SNAPSHOT_FRAMEWORK_NAMES,
  splitSnapshotPath,
  type SnapshotDiffEntry
} from './snapshot-diff-entries'
import { DEFAULT_SNAPSHOT_DIFF_DISPLAY } from './snapshot-diff-display'
import { SnapshotDiffDetail } from './SnapshotDiffDetail'
import { useSnapshotImages, type SnapshotImagesLoader } from './use-snapshot-images'

function SnapshotDiffListRow({
  entry,
  current,
  onSelect
}: {
  entry: SnapshotDiffEntry
  current: boolean
  onSelect: () => void
}): JSX.Element {
  const { name, directory } = splitSnapshotPath(entry.path)
  return (
    <li>
      <button
        type="button"
        data-testid="snapshot-diff-entry"
        data-current={current ? 'true' : undefined}
        aria-current={current ? 'true' : undefined}
        title={entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
        className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[current=true]:bg-accent"
        onClick={onSelect}
      >
        <span
          className="w-3 shrink-0 text-center font-mono text-xs font-semibold"
          style={{ color: STATUS_COLORS[entry.status] }}
        >
          {STATUS_LABELS[entry.status]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{name}</span>
          <span className="block truncate text-2xs text-muted-foreground">
            {SNAPSHOT_FRAMEWORK_NAMES[entry.framework]}
            {entry.uncommitted ? ` · ${translate('snapshotDiff.uncommitted', 'Uncommitted')}` : ''}
            {directory ? ` · ${directory}` : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

function CenteredNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Changed snapshot test images of one diff: a list, and the chosen one as before, after and difference or blend. */
export function SnapshotDiffView({
  entries,
  loadImages,
  revisionKey,
  scopeLabel,
  leading
}: {
  entries: readonly SnapshotDiffEntry[]
  /** Must keep its identity between renders; a new one reloads the selected snapshot. */
  loadImages: SnapshotImagesLoader
  /** Names revisions whose images cannot change; null where they can, so nothing is kept. */
  revisionKey: string | null
  /** What the snapshots are compared against, e.g. the base branch. */
  scopeLabel: string
  leading?: ReactNode
}): JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [display, setDisplay] = useState(DEFAULT_SNAPSHOT_DIFF_DISPLAY)
  // Why the fallback: open on the first snapshot instead of an empty pane.
  const selected = entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null
  const { state, retry } = useSnapshotImages(selected, loadImages, revisionKey)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="snapshot-diff-view">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {leading}
        <h2 className="text-sm font-medium">{translate('snapshotDiff.title', 'Snapshots')}</h2>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {translate('snapshotDiff.count', 'Changed snapshot images: {{value0}}', {
            value0: entries.length
          })}
          {scopeLabel ? ` · ${scopeLabel}` : ''}
        </span>
      </div>
      {!selected ? (
        <CenteredNote>
          <p>{translate('snapshotDiff.empty', 'No snapshot test images changed in this diff.')}</p>
          <p className="text-xs">
            {translate(
              'snapshotDiff.emptyHint',
              'Images of Paparazzi, Roborazzi and swift-snapshot-testing are recognized by their path.'
            )}
          </p>
        </CenteredNote>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul
            aria-label={translate('snapshotDiff.listLabel', 'Changed snapshots')}
            className="w-64 shrink-0 overflow-y-auto border-r border-border py-1 scrollbar-sleek"
          >
            {entries.map((entry) => (
              <SnapshotDiffListRow
                key={entry.key}
                entry={entry}
                current={entry.key === selected.key}
                onSelect={() => setSelectedKey(entry.key)}
              />
            ))}
          </ul>
          {state.kind === 'ready' ? (
            <SnapshotDiffDetail
              key={selected.key}
              entry={selected}
              images={state.images}
              display={display}
              onDisplayChange={setDisplay}
            />
          ) : state.kind === 'loading' ? (
            <CenteredNote>
              {translate('snapshotDiff.loadingImages', 'Loading snapshot…')}
            </CenteredNote>
          ) : state.kind === 'no-preview' ? (
            <CenteredNote>
              {translate('snapshotDiff.noPreview', 'This file has no image preview.')}
            </CenteredNote>
          ) : (
            <CenteredNote>
              <p role="alert" className="text-destructive">
                {state.message}
              </p>
              <Button variant="outline" size="sm" onClick={retry}>
                {translate('snapshotDiff.retry', 'Retry')}
              </Button>
            </CenteredNote>
          )}
        </div>
      )}
    </div>
  )
}
