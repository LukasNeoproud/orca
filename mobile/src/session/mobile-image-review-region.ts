import type { ImageReviewRegion } from '../../../src/shared/diff-comment-types'

export type MobileImageViewport = {
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  zoom: number
}

type Point = { x: number; y: number }

const MIN_REGION_PERCENT = 1

export function mobileImageContainRect(viewport: MobileImageViewport) {
  const { width, height, imageWidth, imageHeight, zoom } = viewport
  if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0 || zoom <= 0) {
    return null
  }
  const containScale = Math.min(width / imageWidth, height / imageHeight)
  const renderedWidth = imageWidth * containScale * zoom
  const renderedHeight = imageHeight * containScale * zoom
  return {
    x: (width - renderedWidth) / 2,
    y: (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight
  }
}

export function mobileImageRegionFromDrag(
  start: Point,
  end: Point,
  viewport: MobileImageViewport
): ImageReviewRegion | null {
  const rect = mobileImageContainRect(viewport)
  if (!rect) {
    return null
  }
  const x1 = clamp(((Math.min(start.x, end.x) - rect.x) / rect.width) * 100, 0, 100)
  const y1 = clamp(((Math.min(start.y, end.y) - rect.y) / rect.height) * 100, 0, 100)
  const x2 = clamp(((Math.max(start.x, end.x) - rect.x) / rect.width) * 100, 0, 100)
  const y2 = clamp(((Math.max(start.y, end.y) - rect.y) / rect.height) * 100, 0, 100)
  if (x2 - x1 < MIN_REGION_PERCENT || y2 - y1 < MIN_REGION_PERCENT) {
    return null
  }
  return roundMobileImageRegion({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
}

export function mobileImageRegionLayout(region: ImageReviewRegion, viewport: MobileImageViewport) {
  const rect = mobileImageContainRect(viewport)
  if (!rect) {
    return null
  }
  return {
    left: rect.x + (region.x / 100) * rect.width,
    top: rect.y + (region.y / 100) * rect.height,
    width: (region.width / 100) * rect.width,
    height: (region.height / 100) * rect.height
  }
}

export function adjustMobileImageRegion(
  region: ImageReviewRegion,
  field: keyof ImageReviewRegion,
  delta: number
): ImageReviewRegion {
  const next = { ...region }
  if (field === 'x') {
    next.x = clamp(region.x + delta, 0, 100 - region.width)
  } else if (field === 'y') {
    next.y = clamp(region.y + delta, 0, 100 - region.height)
  } else if (field === 'width') {
    next.width = clamp(region.width + delta, MIN_REGION_PERCENT, 100 - region.x)
  } else {
    next.height = clamp(region.height + delta, MIN_REGION_PERCENT, 100 - region.y)
  }
  return roundMobileImageRegion(next)
}

function roundMobileImageRegion(region: ImageReviewRegion): ImageReviewRegion {
  return {
    x: Math.round(region.x * 10) / 10,
    y: Math.round(region.y * 10) / 10,
    width: Math.round(region.width * 10) / 10,
    height: Math.round(region.height * 10) / 10
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
