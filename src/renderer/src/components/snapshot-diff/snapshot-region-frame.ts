import type { ImageReviewRegion } from '../../../../shared/diff-comment-types'
import type { SnapshotChangeRegion } from './snapshot-change-regions'

// Keeps the outline off the changed pixels it marks.
const FRAME_PADDING_PX = 3

/** A region's outline as percentages of the image, so it tracks any zoom. */
export function snapshotRegionFrame(
  region: SnapshotChangeRegion,
  image: { width: number; height: number }
): ImageReviewRegion {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  // Why clamp both ends: on the smaller side of a resized snapshot a region can lie outside the image.
  const left = Math.min(image.width, Math.max(0, region.x - FRAME_PADDING_PX))
  const top = Math.min(image.height, Math.max(0, region.y - FRAME_PADDING_PX))
  const right = Math.min(image.width, region.x + region.width + FRAME_PADDING_PX)
  const bottom = Math.min(image.height, region.y + region.height + FRAME_PADDING_PX)
  return {
    x: (left / image.width) * 100,
    y: (top / image.height) * 100,
    width: ((right - left) / image.width) * 100,
    height: ((bottom - top) / image.height) * 100
  }
}

/** Scrolls an image surface so the frame's centre sits in the middle of the viewport. */
export function scrollSurfaceToFrame(surface: HTMLElement, frame: ImageReviewRegion): void {
  const image = surface.querySelector('img')
  if (!image) {
    return
  }
  const imageBounds = image.getBoundingClientRect()
  const viewBounds = surface.getBoundingClientRect()
  const centerX = imageBounds.left + ((frame.x + frame.width / 2) / 100) * imageBounds.width
  const centerY = imageBounds.top + ((frame.y + frame.height / 2) / 100) * imageBounds.height
  // Why not scrollIntoView: it also scrolls every clipped ancestor, shifting the app layout.
  surface.scrollLeft += centerX - (viewBounds.left + viewBounds.width / 2)
  surface.scrollTop += centerY - (viewBounds.top + viewBounds.height / 2)
}
