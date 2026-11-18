import { useEffect, useMemo, useState } from 'react'
import type { RasterImageDimensions } from '../../../../shared/raster-image-dimensions'
import type { SnapshotDiffImages } from './snapshot-diff-entries'
import { MAX_SNAPSHOT_DIFF_PIXELS, findOversizedSnapshotImage } from './snapshot-diff-size-limit'
import { SnapshotDiffCanceledError, SnapshotDiffWorkerClient } from './snapshot-diff-worker-client'
import type { SnapshotDiffResult, SnapshotDiffRgba } from './snapshot-diff-worker-protocol'

export type SnapshotDiffReady = Extract<SnapshotDiffResult, { kind: 'ready' }>

export type SnapshotDiffState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  /** One side is missing: an added or a removed snapshot has nothing to compare with. */
  | { kind: 'one-sided'; side: 'added' | 'removed' }
  | ({ kind: 'too-large' } & RasterImageDimensions)
  | { kind: 'ready'; result: SnapshotDiffReady }

// The one colour a changed pixel is painted with; it follows the theme.
const CHANGED_PIXEL_TOKEN = '--destructive'

// Why keyed by the images object: the view keeps loaded images per snapshot, so
// going back to one reuses its comparison without hashing megabytes of base64.
const comparisonCache = new WeakMap<
  SnapshotDiffImages,
  { colorKey: string; result: SnapshotDiffReady }
>()

/** A theme token as RGBA bytes, since a worker cannot read CSS. */
function resolveTokenColor(token: string): SnapshotDiffRgba {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!value || !context) {
    throw new Error(`Theme colour ${token} is unavailable.`)
  }
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return [red, green, blue, 255]
}

function immediateState(images: SnapshotDiffImages): SnapshotDiffState | null {
  if (!images.originalContent || !images.modifiedContent) {
    return { kind: 'one-sided', side: images.modifiedContent ? 'added' : 'removed' }
  }
  const oversized = findOversizedSnapshotImage(images.originalContent, images.modifiedContent)
  return oversized ? { kind: 'too-large', ...oversized } : null
}

/**
 * The pixel comparison of one snapshot, computed in a worker. `isDark` is a
 * dependency only: the highlight colour is read again when the theme flips.
 */
export function useSnapshotDiff(images: SnapshotDiffImages, isDark: boolean): SnapshotDiffState {
  const [settled, setSettled] = useState<{
    images: SnapshotDiffImages
    isDark: boolean
    state: SnapshotDiffState
  } | null>(null)

  // Known without decoding a pixel, so these never start a worker.
  const immediate = useMemo(() => immediateState(images), [images])

  useEffect(() => {
    if (immediate) {
      return
    }
    let changedRgba: SnapshotDiffRgba
    try {
      changedRgba = resolveTokenColor(CHANGED_PIXEL_TOKEN)
    } catch {
      setSettled({ images, isDark, state: { kind: 'failed' } })
      return
    }
    const colorKey = changedRgba.join(',')
    const cached = comparisonCache.get(images)
    if (cached?.colorKey === colorKey) {
      setSettled({ images, isDark, state: { kind: 'ready', result: cached.result } })
      return
    }
    const client = new SnapshotDiffWorkerClient()
    client
      .compare({ ...images, changedRgba, maxPixels: MAX_SNAPSHOT_DIFF_PIXELS })
      .then((result): SnapshotDiffState => {
        if (result.kind === 'ready') {
          comparisonCache.set(images, { colorKey, result })
          return { kind: 'ready', result }
        }
        return result
      })
      .catch((error: unknown): SnapshotDiffState | null =>
        error instanceof SnapshotDiffCanceledError ? null : { kind: 'failed' }
      )
      .then((state) => {
        if (state) {
          setSettled({ images, isDark, state })
        }
        client.dispose()
      })
    return () => client.dispose()
  }, [images, immediate, isDark])

  if (immediate) {
    return immediate
  }
  return settled && settled.images === images && settled.isDark === isDark
    ? settled.state
    : { kind: 'loading' }
}
