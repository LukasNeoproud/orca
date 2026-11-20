import type { JSX } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { translate } from '@/i18n/i18n'
import { formatChangedPixelPercent } from '@/components/editor/image-pixel-difference'
import {
  IMAGE_VIEWER_ZOOM_STEP,
  MAX_IMAGE_VIEWER_ZOOM,
  MIN_IMAGE_VIEWER_ZOOM
} from '@/components/editor/image-viewer-zoom'
import type { SnapshotDiffDisplay, SnapshotDiffMode } from './snapshot-diff-display'
import type { SnapshotDiffReady } from './use-snapshot-diff'

/** What the difference colors mean, in the code diff's removed and added colors. */
function SnapshotDiffLegend(): JSX.Element {
  return (
    <ul
      aria-label={translate('snapshotDiff.legendLabel', 'Difference colors')}
      data-testid="snapshot-diff-legend"
      className="flex items-center gap-3 px-1"
    >
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-sm bg-[color:var(--git-decoration-deleted)]"
        />
        {translate('snapshotDiff.legendRemoved', 'Removed (before)')}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-sm bg-[color:var(--git-decoration-added)]"
        />
        {translate('snapshotDiff.legendAdded', 'Added or changed (after)')}
      </li>
    </ul>
  )
}

function SnapshotDiffModeToggle({
  mode,
  onChange
}: {
  mode: SnapshotDiffMode
  onChange: (mode: SnapshotDiffMode) => void
}): JSX.Element {
  const option = (value: SnapshotDiffMode, label: string): JSX.Element => (
    <Button
      variant={mode === value ? 'secondary' : 'ghost'}
      size="xs"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
    >
      {label}
    </Button>
  )
  return (
    <div
      className="ml-2 flex items-center gap-0.5"
      role="group"
      aria-label={translate('snapshotDiff.modeLabel', 'Comparison view')}
    >
      {option('difference', translate('snapshotDiff.difference', 'Difference'))}
      {option('blend', translate('snapshotDiff.modeBlend', 'Blend'))}
    </div>
  )
}

/** Zoom, what the third pane shows and how, and the comparison summary of one snapshot. */
export function SnapshotDiffToolbar({
  zoom,
  onZoomChange,
  display,
  onDisplayChange,
  canBlend,
  path,
  result
}: {
  zoom: number
  onZoomChange: (next: (current: number) => number) => void
  display: SnapshotDiffDisplay
  onDisplayChange: (display: SnapshotDiffDisplay) => void
  /** False when one side is missing, so there is nothing to blend. */
  canBlend: boolean
  path: string
  result: SnapshotDiffReady | null
}): JSX.Element {
  const mode = canBlend ? display.mode : 'difference'
  const showLegend = mode === 'difference' && display.highlight && (result?.changedPixels ?? 0) > 0
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onZoomChange((current) => current / IMAGE_VIEWER_ZOOM_STEP)}
        disabled={zoom <= MIN_IMAGE_VIEWER_ZOOM}
        aria-label={translate('auto.components.editor.ImageViewer.be27304574', 'Zoom out')}
      >
        <ZoomOut className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onZoomChange(() => 1)}
        disabled={zoom === 1}
        aria-label={translate('auto.components.editor.ImageViewer.6c89c73d9f', 'Reset zoom')}
      >
        <RotateCcw className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onZoomChange((current) => current * IMAGE_VIEWER_ZOOM_STEP)}
        disabled={zoom >= MAX_IMAGE_VIEWER_ZOOM}
        aria-label={translate('auto.components.editor.ImageViewer.3c9217f5a6', 'Zoom in')}
      >
        <ZoomIn className="size-3.5" />
      </Button>
      <span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span>
      {canBlend && (
        <SnapshotDiffModeToggle
          mode={mode}
          onChange={(next) => onDisplayChange({ ...display, mode: next })}
        />
      )}
      {mode === 'difference' ? (
        <Button
          variant={display.highlight ? 'secondary' : 'ghost'}
          size="xs"
          aria-pressed={display.highlight}
          onClick={() => onDisplayChange({ ...display, highlight: !display.highlight })}
        >
          {translate('snapshotDiff.highlight', 'Highlight changes')}
        </Button>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <span>{translate('snapshotDiff.before', 'Before')}</span>
          <Slider
            className="w-28"
            value={[display.afterPercent]}
            min={0}
            max={100}
            step={1}
            thumbLabels={[translate('snapshotDiff.blendOpacity', 'Share of the after image')]}
            thumbValueLabels={[
              translate('snapshotDiff.blendValue', '{{value0}} % after', {
                value0: display.afterPercent
              })
            ]}
            onValueChange={([afterPercent]) => onDisplayChange({ ...display, afterPercent })}
          />
          <span>{translate('snapshotDiff.after', 'After')}</span>
        </div>
      )}
      {showLegend && <SnapshotDiffLegend />}
      <span className="ml-2 min-w-0 flex-1 truncate font-mono" title={path}>
        {path}
      </span>
      {result && (
        <span className="shrink-0" data-testid="snapshot-diff-summary">
          {result.changedPixels === 0
            ? translate('snapshotDiff.noPixelChange', 'No visible pixel difference.')
            : translate(
                'snapshotDiff.changedSummary',
                'Changed pixels: {{percent}} % · Change areas: {{areas}}',
                {
                  percent: formatChangedPixelPercent(
                    (result.changedPixels / (result.width * result.height)) * 100
                  ),
                  areas: result.regions.length
                }
              )}
        </span>
      )}
    </div>
  )
}
