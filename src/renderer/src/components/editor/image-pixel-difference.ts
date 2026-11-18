// Why a tolerance: re-encoded screenshots differ by a few levels without any visible change.
const CHANNEL_TOLERANCE = 16
const CHANGED_RGBA = [255, 45, 85, 255] as const
const UNCHANGED_ALPHA = 0.3

export type ImagePixelDifferenceOptions = {
  /** Highlight for changed pixels, for callers that resolve it from a theme token. */
  changedRgba?: readonly [number, number, number, number]
  /** One byte per pixel, set to 1 where the pixel changed; must be zeroed by the caller. */
  changedMask?: Uint8Array
}

export type ImagePixelDifference = {
  /** RGBA: changed pixels in a solid highlight, unchanged ones as a faint grey of the new image. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  changedPixels: number
}

/** Compares two RGBA buffers of the same size, pixel by pixel. */
export function imagePixelDifference(
  original: Uint8ClampedArray,
  modified: Uint8ClampedArray,
  options: ImagePixelDifferenceOptions = {}
): ImagePixelDifference {
  if (original.length !== modified.length) {
    throw new Error('Both images must be drawn at the same size before comparing.')
  }
  const changedRgba = options.changedRgba ?? CHANGED_RGBA
  const changedMask = options.changedMask
  const pixels = new Uint8ClampedArray(modified.length)
  let changedPixels = 0
  // Why hand-rolled: this runs per pixel of multi-megapixel screenshots on the UI thread.
  for (let index = 0; index < modified.length; index += 4) {
    const red = modified[index]
    const green = modified[index + 1]
    const blue = modified[index + 2]
    const alpha = modified[index + 3]
    const dr = original[index] - red
    const dg = original[index + 1] - green
    const db = original[index + 2] - blue
    const da = original[index + 3] - alpha
    if (
      dr > CHANNEL_TOLERANCE ||
      dr < -CHANNEL_TOLERANCE ||
      dg > CHANNEL_TOLERANCE ||
      dg < -CHANNEL_TOLERANCE ||
      db > CHANNEL_TOLERANCE ||
      db < -CHANNEL_TOLERANCE ||
      da > CHANNEL_TOLERANCE ||
      da < -CHANNEL_TOLERANCE
    ) {
      pixels[index] = changedRgba[0]
      pixels[index + 1] = changedRgba[1]
      pixels[index + 2] = changedRgba[2]
      pixels[index + 3] = changedRgba[3]
      if (changedMask) {
        changedMask[index >> 2] = 1
      }
      changedPixels += 1
      continue
    }
    // Uint8ClampedArray rounds on write.
    const grey = 0.299 * red + 0.587 * green + 0.114 * blue
    pixels[index] = grey
    pixels[index + 1] = grey
    pixels[index + 2] = grey
    pixels[index + 3] = alpha * UNCHANGED_ALPHA
  }
  return { pixels, changedPixels }
}

/** Share of changed pixels for a label; a trace below one decimal reads as "<0.1", not "0.0". */
export function formatChangedPixelPercent(percent: number): string {
  return percent > 0 && percent < 0.1 ? '<0.1' : percent.toFixed(1)
}
