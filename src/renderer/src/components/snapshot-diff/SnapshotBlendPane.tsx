import { useMemo, type JSX } from 'react'
import { translate } from '@/i18n/i18n'
import { ImageDiffPane } from '@/components/editor/ImageDiffPane'
import { buildImageDataUri } from '../../../../shared/image-data-uri'
import type { ImageReviewRegion } from '../../../../shared/diff-comment-types'
import type { RasterImageDimensions } from '../../../../shared/raster-image-dimensions'
import type { SnapshotDiffImages } from './snapshot-diff-entries'

const NO_REGIONS: readonly ImageReviewRegion[] = []
const ignoreRegion = (): void => {}

/** The before image with the after image over it at `afterPercent` opacity, to judge a change by eye. */
export function SnapshotBlendPane({
  images,
  sizes,
  afterPercent,
  filePath,
  zoom,
  region,
  onScroll,
  onSurface
}: {
  images: SnapshotDiffImages
  sizes: { original: RasterImageDimensions | null; modified: RasterImageDimensions | null }
  afterPercent: number
  filePath: string
  zoom: number
  /** Outline on the before image, drawn above the blended after image. */
  region: ImageReviewRegion | null
  onScroll: (surface: HTMLDivElement) => void
  onSurface: (surface: HTMLDivElement | null) => void
}): JSX.Element {
  const afterSource = useMemo(
    () => buildImageDataUri(images.mimeType, images.modifiedContent),
    [images]
  )
  // Why relative: a resized snapshot keeps its own size, anchored top left as in the difference.
  const afterSize =
    sizes.original && sizes.modified
      ? {
          width: `${(sizes.modified.width / sizes.original.width) * 100}%`,
          height: `${(sizes.modified.height / sizes.original.height) * 100}%`
        }
      : { width: '100%', height: '100%' }

  return (
    <ImageDiffPane
      label={translate('snapshotDiff.modeBlend', 'Blend')}
      content={images.originalContent}
      mimeType={images.mimeType}
      filePath={filePath}
      zoom={zoom}
      layout="fill"
      annotating={false}
      region={null}
      savedRegions={NO_REGIONS}
      overlay={
        <>
          {afterSource && (
            <img
              src={afterSource}
              alt=""
              aria-hidden="true"
              draggable={false}
              data-testid="snapshot-blend-after"
              className="pointer-events-none absolute left-0 top-0 block max-w-none select-none"
              style={{ ...afterSize, opacity: afterPercent / 100 }}
            />
          )}
          {region && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute border-2 border-ring bg-ring/20"
              style={{
                left: `${region.x}%`,
                top: `${region.y}%`,
                width: `${region.width}%`,
                height: `${region.height}%`
              }}
            />
          )}
        </>
      }
      onRegion={ignoreRegion}
      onScroll={onScroll}
      onSurface={onSurface}
    />
  )
}
