import { useEffect, useState, type JSX } from 'react'
import { translate } from '@/i18n/i18n'
import { buildImageDataUri } from '../../../../shared/image-data-uri'
import { MAX_RASTER_IMAGE_PREVIEW_PIXELS } from '../../../../shared/raster-image-preview-limits'
import { ImageDiffPane } from './ImageDiffPane'
import { imagePixelDifference } from './image-pixel-difference'

type Difference =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; content: string; changedPercent: number }

async function decode(mimeType: string, content: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = buildImageDataUri(mimeType, content.replace(/\s/g, '')) ?? ''
  await image.decode()
  return image
}

function pixelsOf(image: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas 2D is unavailable.')
  }
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, width, height).data
}

/** Both images drawn at the larger size and compared pixel by pixel, as a base64 PNG. */
async function computeDifference(
  mimeType: string,
  originalContent: string,
  modifiedContent: string
): Promise<Difference> {
  const [original, modified] = await Promise.all([
    decode(mimeType, originalContent),
    decode(mimeType, modifiedContent)
  ])
  const width = Math.max(original.naturalWidth, modified.naturalWidth)
  const height = Math.max(original.naturalHeight, modified.naturalHeight)
  if (width <= 0 || height <= 0 || width * height > MAX_RASTER_IMAGE_PREVIEW_PIXELS) {
    return { kind: 'failed' }
  }
  const { pixels, changedPixels } = imagePixelDifference(
    pixelsOf(original, width, height),
    pixelsOf(modified, width, height)
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0)
  return {
    kind: 'ready',
    content: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
    changedPercent: (changedPixels / (width * height)) * 100
  }
}

function formatPercent(percent: number): string {
  return percent > 0 && percent < 0.1 ? '<0.1' : percent.toFixed(1)
}

/** One pane that shows where the two versions of an image differ. */
export function ImageDifferencePane({
  originalContent,
  modifiedContent,
  filePath,
  mimeType,
  zoom,
  layout,
  onSurface
}: {
  originalContent: string
  modifiedContent: string
  filePath: string
  mimeType: string
  zoom: number
  layout: 'fill' | 'intrinsic'
  onSurface: (surface: HTMLDivElement | null) => void
}): JSX.Element {
  const [difference, setDifference] = useState<Difference>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setDifference({ kind: 'loading' })
    computeDifference(mimeType, originalContent, modifiedContent)
      .catch((): Difference => ({ kind: 'failed' }))
      .then((next) => {
        if (!cancelled) {
          setDifference(next)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mimeType, originalContent, modifiedContent])

  if (difference.kind !== 'ready') {
    return (
      <div className="flex min-h-32 items-center justify-center p-6 text-sm text-muted-foreground">
        {difference.kind === 'loading'
          ? translate('image.review.differenceLoading', 'Comparing images…')
          : translate('image.review.differenceFailed', 'These images cannot be compared.')}
      </div>
    )
  }
  return (
    <ImageDiffPane
      label={translate('image.review.differenceLabel', 'Changed pixels: {{value0}} %', {
        value0: formatPercent(difference.changedPercent)
      })}
      content={difference.content}
      filePath={filePath}
      mimeType="image/png"
      zoom={zoom}
      layout={layout}
      annotating={false}
      region={null}
      savedRegions={[]}
      onRegion={() => {}}
      onScroll={() => {}}
      onSurface={onSurface}
    />
  )
}
