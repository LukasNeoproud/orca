import { describe, expect, it } from 'vitest'
import { imageReviewRegionBetween, isImageReviewRegion, pointOnImage } from './image-review-region'

describe('image review regions', () => {
  it('maps a drag to natural image percentages regardless of display size or direction', () => {
    const image = {
      getBoundingClientRect: () => ({ left: 20, top: 40, width: 200, height: 100 })
    } as Element
    const start = pointOnImage({ clientX: 170, clientY: 115 }, image)
    const end = pointOnImage({ clientX: 70, clientY: 65 }, image)
    expect(imageReviewRegionBetween(start, end)).toEqual({ x: 25, y: 25, width: 50, height: 50 })
  })

  it('ignores clicks and rejects areas outside image bounds', () => {
    expect(imageReviewRegionBetween({ x: 10, y: 10 }, { x: 10.5, y: 50 })).toBeNull()
    expect(isImageReviewRegion({ x: 80, y: 0, width: 30, height: 20 })).toBe(false)
    expect(isImageReviewRegion({ x: 0, y: 0, width: 100, height: 100 })).toBe(true)
  })
})
