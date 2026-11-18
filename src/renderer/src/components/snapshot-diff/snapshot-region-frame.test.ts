import { describe, expect, it } from 'vitest'
import { snapshotRegionFrame } from './snapshot-region-frame'

describe('snapshotRegionFrame', () => {
  it('pads the outline around the region, as percentages of the image', () => {
    expect(
      snapshotRegionFrame(
        { x: 103, y: 203, width: 94, height: 44, changedPixels: 1 },
        { width: 1000, height: 500 }
      )
    ).toEqual({ x: 10, y: 40, width: 10, height: 10 })
  })

  it('keeps the outline inside the image at its edges', () => {
    expect(
      snapshotRegionFrame(
        { x: 0, y: 0, width: 200, height: 100, changedPixels: 1 },
        { width: 200, height: 100 }
      )
    ).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('collapses a region that lies outside the smaller side of a resized snapshot', () => {
    const frame = snapshotRegionFrame(
      { x: 300, y: 500, width: 40, height: 40, changedPixels: 1 },
      { width: 200, height: 400 }
    )
    expect(frame).toEqual({ x: 100, y: 100, width: 0, height: 0 })
  })

  it('has no outline on an image without pixels', () => {
    expect(
      snapshotRegionFrame(
        { x: 1, y: 1, width: 1, height: 1, changedPixels: 1 },
        { width: 0, height: 0 }
      )
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
