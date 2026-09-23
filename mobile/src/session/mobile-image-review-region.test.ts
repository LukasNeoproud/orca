import { describe, expect, it } from 'vitest'
import {
  adjustMobileImageRegion,
  mobileImageRegionFromDrag,
  mobileImageRegionLayout
} from './mobile-image-review-region'

const VIEWPORT = { width: 300, height: 300, imageWidth: 400, imageHeight: 200, zoom: 1 }

describe('mobile image review regions', () => {
  it('stores drag coordinates as percentages of the contained image', () => {
    expect(mobileImageRegionFromDrag({ x: 30, y: 90 }, { x: 180, y: 165 }, VIEWPORT)).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 50
    })
  })

  it('keeps percentage regions stable while zoom changes their screen layout', () => {
    const region = { x: 10, y: 10, width: 50, height: 50 }
    const normal = mobileImageRegionLayout(region, VIEWPORT)
    const zoomed = mobileImageRegionLayout(region, { ...VIEWPORT, zoom: 2 })

    expect(normal).toEqual({ left: 30, top: 90, width: 150, height: 75 })
    expect(zoomed).toEqual({ left: -90, top: 30, width: 300, height: 150 })
  })

  it('clamps accessible coordinate adjustments inside the image', () => {
    expect(adjustMobileImageRegion({ x: 70, y: 80, width: 30, height: 20 }, 'x', 10)).toEqual({
      x: 70,
      y: 80,
      width: 30,
      height: 20
    })
    expect(adjustMobileImageRegion({ x: 70, y: 80, width: 30, height: 20 }, 'width', -40)).toEqual({
      x: 70,
      y: 80,
      width: 1,
      height: 20
    })
  })
})
