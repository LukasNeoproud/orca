import type { SnapshotChangeRegion } from './snapshot-change-regions'
import type { SnapshotDiffRgba } from './snapshot-diff-worker-protocol'

/** Mask values: 0 unchanged, 1 changed with no side yet, then the side it was assigned. */
const CHANGED = 1
export const SNAPSHOT_PIXEL_REMOVED = 2
export const SNAPSHOT_PIXEL_ADDED = 3

// Unchanged pixels this far around an area are its background, as well as those inside it.
const BACKGROUND_MARGIN_PX = 8
const MAX_BACKGROUND_SAMPLES = 1 << 16
// Why 4 bits a channel: anti-aliasing and re-encoding noise of one colour land in one bin.
const BIN_SHIFT = 4
const BIN_COUNT = 1 << 16

export type SnapshotRgbaImage = {
  original: Uint8ClampedArray
  modified: Uint8ClampedArray
  width: number
  height: number
}

export type SnapshotChangeSideCounts = { removedPixels: number; addedPixels: number }

type Box = { left: number; top: number; right: number; bottom: number }

function binOf(pixels: Uint8ClampedArray, index: number): number {
  return (
    ((pixels[index] >> BIN_SHIFT) << 12) |
    ((pixels[index + 1] >> BIN_SHIFT) << 8) |
    ((pixels[index + 2] >> BIN_SHIFT) << 4) |
    (pixels[index + 3] >> BIN_SHIFT)
  )
}

/**
 * The most common colour among sampled pixels of the box: unchanged ones when there are
 * any, else the old image's. Returns the mean of that colour's bin, not its bin edge.
 */
function backgroundOf(
  image: SnapshotRgbaImage,
  mask: Uint8Array,
  box: Box,
  bins: Uint32Array
): SnapshotDiffRgba {
  const area = (box.right - box.left) * (box.bottom - box.top)
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / MAX_BACKGROUND_SAMPLES)))
  const visit = (unchangedOnly: boolean, onPixel: (index: number) => void): void => {
    for (let y = box.top; y < box.bottom; y += stride) {
      for (let x = box.left; x < box.right; x += stride) {
        const pixel = y * image.width + x
        if (!unchangedOnly || mask[pixel] === 0) {
          onPixel(pixel * 4)
        }
      }
    }
  }
  bins.fill(0)
  let sampled = 0
  visit(true, (index) => {
    bins[binOf(image.original, index)] += 1
    sampled += 1
  })
  const unchangedOnly = sampled > 0
  if (!unchangedOnly) {
    visit(false, (index) => {
      bins[binOf(image.original, index)] += 1
    })
  }
  let modeBin = 0
  for (let bin = 1; bin < BIN_COUNT; bin += 1) {
    if (bins[bin] > bins[modeBin]) {
      modeBin = bin
    }
  }
  const sum = [0, 0, 0, 0]
  let count = 0
  visit(unchangedOnly, (index) => {
    if (binOf(image.original, index) === modeBin) {
      sum[0] += image.original[index]
      sum[1] += image.original[index + 1]
      sum[2] += image.original[index + 2]
      sum[3] += image.original[index + 3]
      count += 1
    }
  })
  return [sum[0] / count, sum[1] / count, sum[2] / count, sum[3] / count]
}

function distanceSquared(
  pixels: Uint8ClampedArray,
  index: number,
  background: SnapshotDiffRgba
): number {
  const red = pixels[index] - background[0]
  const green = pixels[index + 1] - background[1]
  const blue = pixels[index + 2] - background[2]
  const alpha = pixels[index + 3] - background[3]
  return red * red + green * green + blue * blue + alpha * alpha
}

/**
 * Marks each changed pixel of `mask` (value 1) as removed or added, in place.
 *
 * A pixel is removed when the new image is back near the area's background there,
 * closer than half the old image's distance from it: something of the old state is
 * gone. Anything else, new content or content that changed colour in place, is added,
 * since it shows the new state. The background is the area's own, so moved light text
 * on a dark card splits the same way as dark text on a light page.
 *
 * `regions` must cover every changed pixel, as `findSnapshotChangeRegions` does.
 */
export function splitSnapshotChangeSides(
  image: SnapshotRgbaImage,
  mask: Uint8Array,
  regions: readonly SnapshotChangeRegion[]
): SnapshotChangeSideCounts {
  const counts: SnapshotChangeSideCounts = { removedPixels: 0, addedPixels: 0 }
  const bins = new Uint32Array(BIN_COUNT)
  for (const region of regions) {
    const background = backgroundOf(
      image,
      mask,
      {
        left: Math.max(0, region.x - BACKGROUND_MARGIN_PX),
        top: Math.max(0, region.y - BACKGROUND_MARGIN_PX),
        right: Math.min(image.width, region.x + region.width + BACKGROUND_MARGIN_PX),
        bottom: Math.min(image.height, region.y + region.height + BACKGROUND_MARGIN_PX)
      },
      bins
    )
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const pixel = y * image.width + x
        if (mask[pixel] !== CHANGED) {
          continue
        }
        const index = pixel * 4
        // Squared distances, so "under half" is a factor of four.
        const removed =
          4 * distanceSquared(image.modified, index, background) <
          distanceSquared(image.original, index, background)
        mask[pixel] = removed ? SNAPSHOT_PIXEL_REMOVED : SNAPSHOT_PIXEL_ADDED
        if (removed) {
          counts.removedPixels += 1
        } else {
          counts.addedPixels += 1
        }
      }
    }
  }
  return counts
}

/** Paints removed and added pixels of a split mask in their colours; the rest stays. */
export function paintSnapshotChangeSides(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  colors: { removedRgba: SnapshotDiffRgba; addedRgba: SnapshotDiffRgba }
): void {
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const side = mask[pixel]
    if (side === 0) {
      continue
    }
    // A pixel no region reached still changed; it shows the new state.
    const color = side === SNAPSHOT_PIXEL_REMOVED ? colors.removedRgba : colors.addedRgba
    const index = pixel * 4
    pixels[index] = color[0]
    pixels[index + 1] = color[1]
    pixels[index + 2] = color[2]
    pixels[index + 3] = color[3]
  }
}
