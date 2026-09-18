import type { ImageReviewRegion } from '../../../../shared/diff-comment-types'

export type ImageReviewPoint = { x: number; y: number }

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function pointOnImage(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  image: Element
): ImageReviewPoint {
  const bounds = image.getBoundingClientRect()
  return {
    x: clampPercent(((event.clientX - bounds.left) / bounds.width) * 100),
    y: clampPercent(((event.clientY - bounds.top) / bounds.height) * 100)
  }
}

export function imageReviewRegionBetween(
  start: ImageReviewPoint,
  end: ImageReviewPoint
): ImageReviewRegion | null {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(start.x - end.x)
  const height = Math.abs(start.y - end.y)
  if (width < 1 || height < 1) {
    return null
  }
  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    width: Number(width.toFixed(1)),
    height: Number(height.toFixed(1))
  }
}

export function isImageReviewRegion(value: ImageReviewRegion): boolean {
  return (
    Object.values(value).every(Number.isFinite) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 100 &&
    value.y + value.height <= 100
  )
}
