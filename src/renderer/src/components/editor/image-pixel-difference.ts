// Why a tolerance: re-encoded screenshots differ by a few levels without any visible change.
const CHANNEL_TOLERANCE = 16
const CHANGED_RGBA = [255, 45, 85, 255] as const
const UNCHANGED_ALPHA = 0.3

export type ImagePixelDifference = {
  /** RGBA: changed pixels in a solid highlight, unchanged ones as a faint grey of the new image. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  changedPixels: number
}

/** Compares two RGBA buffers of the same size, pixel by pixel. */
export function imagePixelDifference(
  original: Uint8ClampedArray,
  modified: Uint8ClampedArray
): ImagePixelDifference {
  if (original.length !== modified.length) {
    throw new Error('Both images must be drawn at the same size before comparing.')
  }
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
      pixels[index] = CHANGED_RGBA[0]
      pixels[index + 1] = CHANGED_RGBA[1]
      pixels[index + 2] = CHANGED_RGBA[2]
      pixels[index + 3] = CHANGED_RGBA[3]
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
