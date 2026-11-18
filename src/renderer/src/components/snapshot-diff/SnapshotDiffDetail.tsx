import { useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { ImageDiffPane } from '@/components/editor/ImageDiffPane'
import { formatChangedPixelPercent } from '@/components/editor/image-pixel-difference'
import { syncImageSurfaceScroll } from '@/components/editor/image-surface-scroll-sync'
import {
  IMAGE_VIEWER_ZOOM_STEP,
  MAX_IMAGE_VIEWER_ZOOM,
  MIN_IMAGE_VIEWER_ZOOM,
  clampImageViewerZoom
} from '@/components/editor/image-viewer-zoom'
import type { ImageReviewRegion } from '../../../../shared/diff-comment-types'
import type { SnapshotDiffEntry, SnapshotDiffImages } from './snapshot-diff-entries'
import { MAX_SNAPSHOT_DIFF_PIXELS, readSnapshotImageDimensions } from './snapshot-diff-size-limit'
import { scrollSurfaceToFrame, snapshotRegionFrame } from './snapshot-region-frame'
import { SnapshotChangeRegionList, SnapshotChangeRegionOverlay } from './SnapshotChangeRegions'
import { useSnapshotDiff, type SnapshotDiffState } from './use-snapshot-diff'

const NO_REGIONS: readonly ImageReviewRegion[] = []
const ignoreRegion = (): void => {}

/** Stands in for the difference image when there is none, and says why. */
function DifferenceNotice({
  label,
  children
}: {
  label: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md bg-muted/10">
      <div className="flex min-h-8 items-center border-b border-border px-3 py-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div
        role="status"
        className="flex flex-1 items-center justify-center bg-muted/20 p-6 text-center text-sm text-muted-foreground"
      >
        {children}
      </div>
    </section>
  )
}

function differenceNoticeText(diff: Exclude<SnapshotDiffState, { kind: 'ready' }>): string {
  switch (diff.kind) {
    case 'loading':
      return translate('snapshotDiff.comparing', 'Comparing images…')
    case 'failed':
      return translate('snapshotDiff.compareFailed', 'These images could not be compared.')
    case 'one-sided':
      return diff.side === 'added'
        ? translate(
            'snapshotDiff.addedNotice',
            'New snapshot: there is no earlier image to compare with.'
          )
        : translate(
            'snapshotDiff.removedNotice',
            'Removed snapshot: there is no new image to compare with.'
          )
    case 'too-large':
      return translate(
        'snapshotDiff.tooLarge',
        'The difference is not computed: {{width}} × {{height}} px is above the limit of {{limit}} megapixels.',
        {
          width: diff.width,
          height: diff.height,
          limit: MAX_SNAPSHOT_DIFF_PIXELS / 1_000_000
        }
      )
  }
}

/** One snapshot as before, after and difference, with its numbered change areas. */
export function SnapshotDiffDetail({
  entry,
  images,
  highlight,
  onHighlightChange
}: {
  entry: SnapshotDiffEntry
  images: SnapshotDiffImages
  highlight: boolean
  onHighlightChange: (highlight: boolean) => void
}): JSX.Element {
  const isDark = useDocumentDarkTheme()
  const diff = useSnapshotDiff(images, isDark)
  const [zoom, setZoom] = useState(1)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const surfacesRef = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const result = diff.kind === 'ready' ? diff.result : null
  const activeRegion = result && activeIndex !== null ? (result.regions[activeIndex] ?? null) : null
  // Why per side: a resized snapshot has two image sizes, and each pane positions by its own.
  const sideSizes = useMemo(
    () => ({
      original: readSnapshotImageDimensions(images.originalContent),
      modified: readSnapshotImageDimensions(images.modifiedContent)
    }),
    [images]
  )
  const frameOn = (size: { width: number; height: number } | null): ImageReviewRegion | null => {
    if (!activeRegion || !result) {
      return null
    }
    const frame = snapshotRegionFrame(activeRegion, size ?? result)
    return frame.width > 0 && frame.height > 0 ? frame : null
  }

  const syncScroll = (source: HTMLDivElement): void =>
    syncImageSurfaceScroll(source, surfacesRef.current)
  const selectRegion = (index: number): void => {
    setActiveIndex(index)
    const region = result?.regions[index]
    const [before, after, difference] = surfacesRef.current
    const surface = difference ?? after ?? before
    if (!region || !result || !surface) {
      return
    }
    scrollSurfaceToFrame(surface, snapshotRegionFrame(region, result))
    syncScroll(surface)
  }
  const changeZoom = (next: (current: number) => number): void =>
    setZoom((current) => clampImageViewerZoom(next(current)))
  const pane = { filePath: entry.path, zoom, layout: 'fill', annotating: false } as const

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="snapshot-diff-detail">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom((current) => current / IMAGE_VIEWER_ZOOM_STEP)}
          disabled={zoom <= MIN_IMAGE_VIEWER_ZOOM}
          aria-label={translate('auto.components.editor.ImageViewer.be27304574', 'Zoom out')}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom(() => 1)}
          disabled={zoom === 1}
          aria-label={translate('auto.components.editor.ImageViewer.6c89c73d9f', 'Reset zoom')}
        >
          <RotateCcw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom((current) => current * IMAGE_VIEWER_ZOOM_STEP)}
          disabled={zoom >= MAX_IMAGE_VIEWER_ZOOM}
          aria-label={translate('auto.components.editor.ImageViewer.3c9217f5a6', 'Zoom in')}
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          variant={highlight ? 'secondary' : 'ghost'}
          size="xs"
          aria-pressed={highlight}
          onClick={() => onHighlightChange(!highlight)}
        >
          {translate('snapshotDiff.highlight', 'Highlight changes')}
        </Button>
        <span className="ml-2 min-w-0 flex-1 truncate font-mono" title={entry.path}>
          {entry.path}
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
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-3">
        <ImageDiffPane
          {...pane}
          label={translate('snapshotDiff.before', 'Before')}
          content={images.originalContent}
          mimeType={images.mimeType}
          region={frameOn(sideSizes.original)}
          savedRegions={NO_REGIONS}
          onRegion={ignoreRegion}
          onScroll={syncScroll}
          onSurface={(surface) => {
            surfacesRef.current[0] = surface
          }}
        />
        <ImageDiffPane
          {...pane}
          label={translate('snapshotDiff.after', 'After')}
          content={images.modifiedContent}
          mimeType={images.mimeType}
          region={frameOn(sideSizes.modified)}
          savedRegions={NO_REGIONS}
          onRegion={ignoreRegion}
          onScroll={syncScroll}
          onSurface={(surface) => {
            surfacesRef.current[1] = surface
          }}
        />
        {diff.kind === 'ready' ? (
          <ImageDiffPane
            {...pane}
            label={translate('snapshotDiff.difference', 'Difference')}
            content={highlight ? diff.result.highlightContent : diff.result.plainContent}
            mimeType="image/png"
            region={highlight ? null : frameOn(diff.result)}
            savedRegions={NO_REGIONS}
            overlay={
              highlight ? (
                <SnapshotChangeRegionOverlay
                  regions={diff.result.regions}
                  image={diff.result}
                  activeIndex={activeIndex}
                />
              ) : null
            }
            onRegion={ignoreRegion}
            onScroll={syncScroll}
            onSurface={(surface) => {
              surfacesRef.current[2] = surface
            }}
          />
        ) : (
          <DifferenceNotice label={translate('snapshotDiff.difference', 'Difference')}>
            {differenceNoticeText(diff)}
          </DifferenceNotice>
        )}
      </div>
      {result && result.regions.length > 0 && (
        <SnapshotChangeRegionList
          regions={result.regions}
          activeIndex={activeIndex}
          onSelect={selectRegion}
        />
      )}
    </div>
  )
}
