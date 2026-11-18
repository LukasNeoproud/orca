import { decodeBase64Prefix } from '../../../../shared/raster-image-base64-preview'
import {
  readRasterImageDimensions,
  type RasterImageDimensions
} from '../../../../shared/raster-image-dimensions'

// Why lower than the preview limit: the comparison holds both decoded images and
// two result images at once, about 16 bytes per pixel.
export const MAX_SNAPSHOT_DIFF_PIXELS = 8_000_000

// Covers every fixed-offset header and a JPEG's frame marker behind typical metadata.
const HEADER_PROBE_BYTES = 64 * 1024

export function exceedsSnapshotDiffLimit(dimensions: RasterImageDimensions): boolean {
  return dimensions.width * dimensions.height > MAX_SNAPSHOT_DIFF_PIXELS
}

/** Encoded dimensions of a base64 image, read from its header without decoding pixels. */
export function readSnapshotImageDimensions(content: string): RasterImageDimensions | null {
  if (!content) {
    return null
  }
  const header = decodeBase64Prefix(content, HEADER_PROBE_BYTES)
  return header ? readRasterImageDimensions(header) : null
}

/**
 * The image that makes a comparison too large, or null when it may run. An
 * unreadable header is not evidence of size; the worker measures after decoding.
 */
export function findOversizedSnapshotImage(
  originalContent: string,
  modifiedContent: string
): RasterImageDimensions | null {
  const original = readSnapshotImageDimensions(originalContent)
  const modified = readSnapshotImageDimensions(modifiedContent)
  // The comparison canvas spans both images.
  const canvas = {
    width: Math.max(original?.width ?? 0, modified?.width ?? 0),
    height: Math.max(original?.height ?? 0, modified?.height ?? 0)
  }
  if (!exceedsSnapshotDiffLimit(canvas)) {
    return null
  }
  if (modified && exceedsSnapshotDiffLimit(modified)) {
    return modified
  }
  return original && exceedsSnapshotDiffLimit(original) ? original : canvas
}
