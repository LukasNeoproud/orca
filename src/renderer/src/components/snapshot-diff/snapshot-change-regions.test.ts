import { describe, expect, it } from 'vitest'
import { findSnapshotChangeRegions } from './snapshot-change-regions'

function maskOf(
  width: number,
  height: number,
  rects: readonly { x: number; y: number; width: number; height: number }[]
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      mask.fill(1, y * width + rect.x, y * width + rect.x + rect.width)
    }
  }
  return mask
}

describe('findSnapshotChangeRegions', () => {
  it('returns no region for an unchanged image', () => {
    expect(findSnapshotChangeRegions(new Uint8Array(64 * 64), 64, 64)).toEqual([])
  })

  it('reports each separate area with tight pixel bounds, in reading order', () => {
    const lower = { x: 10, y: 150, width: 30, height: 12 }
    const upperRight = { x: 120, y: 20, width: 40, height: 16 }
    const upperLeft = { x: 16, y: 24, width: 20, height: 8 }
    const regions = findSnapshotChangeRegions(
      maskOf(200, 200, [lower, upperRight, upperLeft]),
      200,
      200
    )
    expect(regions).toEqual([
      { ...upperRight, changedPixels: 40 * 16 },
      { ...upperLeft, changedPixels: 20 * 8 },
      { ...lower, changedPixels: 30 * 12 }
    ])
  })

  it('joins specks that sit within a cell of each other, as changed text does', () => {
    // Glyph-like 2px strokes every 6px: detached pixels, one changed line.
    const strokes = Array.from({ length: 10 }, (_, index) => ({
      x: 20 + index * 6,
      y: 40,
      width: 2,
      height: 10
    }))
    const regions = findSnapshotChangeRegions(maskOf(160, 100, strokes), 160, 100)
    expect(regions).toEqual([{ x: 20, y: 40, width: 56, height: 10, changedPixels: 10 * 2 * 10 }])
  })

  it('keeps areas apart when the gap is wider than a cell', () => {
    const regions = findSnapshotChangeRegions(
      maskOf(200, 40, [
        { x: 8, y: 8, width: 8, height: 8 },
        { x: 40, y: 8, width: 8, height: 8 }
      ]),
      200,
      40
    )
    expect(regions.map((region) => region.x)).toEqual([8, 40])
  })

  it('coarsens until the areas fit the limit, without losing changed pixels', () => {
    // A 6x6 lattice of dots 24px apart: 36 areas at the base cell size.
    const dots = Array.from({ length: 36 }, (_, index) => ({
      x: 4 + (index % 6) * 24,
      y: 4 + Math.floor(index / 6) * 24,
      width: 2,
      height: 2
    }))
    const mask = maskOf(160, 160, dots)
    expect(findSnapshotChangeRegions(mask, 160, 160, { maxRegions: 100 })).toHaveLength(36)
    const merged = findSnapshotChangeRegions(mask, 160, 160, { maxRegions: 5 })
    expect(merged.length).toBeGreaterThan(0)
    expect(merged.length).toBeLessThanOrEqual(5)
    expect(merged.reduce((total, region) => total + region.changedPixels, 0)).toBe(36 * 4)
  })

  it('handles a change that reaches the image edge and a mask shorter than the image', () => {
    const regions = findSnapshotChangeRegions(
      maskOf(50, 30, [{ x: 44, y: 25, width: 6, height: 5 }]),
      50,
      30
    )
    expect(regions).toEqual([{ x: 44, y: 25, width: 6, height: 5, changedPixels: 30 }])
    expect(findSnapshotChangeRegions(new Uint8Array(10), 50, 30)).toEqual([])
    expect(findSnapshotChangeRegions(new Uint8Array(0), 0, 0)).toEqual([])
  })
})
