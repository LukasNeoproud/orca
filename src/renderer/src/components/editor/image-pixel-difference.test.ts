import { describe, expect, it } from 'vitest'
import { imagePixelDifference } from './image-pixel-difference'

const rgba = (...pixels: number[][]): Uint8ClampedArray => new Uint8ClampedArray(pixels.flat())

describe('imagePixelDifference', () => {
  it('highlights changed pixels and fades unchanged ones', () => {
    const result = imagePixelDifference(
      rgba([10, 10, 10, 255], [200, 0, 0, 255], [0, 0, 0, 0]),
      rgba([18, 10, 10, 255], [0, 0, 200, 255], [0, 0, 0, 255])
    )
    expect(result.changedPixels).toBe(2)
    expect(Array.from(result.pixels.slice(0, 4))).toEqual([12, 12, 12, 76])
    expect(Array.from(result.pixels.slice(4, 8))).toEqual([255, 45, 85, 255])
    // A pixel that only one image covers counts as changed.
    expect(Array.from(result.pixels.slice(8, 12))).toEqual([255, 45, 85, 255])
  })

  it('paints changed pixels in the given colour and marks them in the mask', () => {
    const changedMask = new Uint8Array(3)
    const result = imagePixelDifference(
      rgba([10, 10, 10, 255], [200, 0, 0, 255], [5, 5, 5, 255]),
      rgba([10, 10, 10, 255], [0, 0, 200, 255], [5, 5, 5, 255]),
      { changedRgba: [1, 2, 3, 200], changedMask }
    )
    expect(result.changedPixels).toBe(1)
    expect(Array.from(result.pixels.slice(4, 8))).toEqual([1, 2, 3, 200])
    expect(Array.from(changedMask)).toEqual([0, 1, 0])
  })

  it('rejects buffers of different sizes', () => {
    expect(() => imagePixelDifference(rgba([0, 0, 0, 0]), rgba())).toThrow()
  })
})
