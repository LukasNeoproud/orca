import { describe, expect, it } from 'vitest'
import {
  MAX_SNAPSHOT_DIFF_PIXELS,
  findOversizedSnapshotImage,
  readSnapshotImageDimensions
} from './snapshot-diff-size-limit'

/** A PNG signature and IHDR chunk; enough for a header read, not a decodable image. */
function pngHeader(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return Buffer.from(bytes).toString('base64')
}

describe('snapshot diff size limit', () => {
  it('reads the encoded size from the header', () => {
    expect(readSnapshotImageDimensions(pngHeader(1080, 2400))).toEqual({
      width: 1080,
      height: 2400
    })
    expect(readSnapshotImageDimensions('')).toBeNull()
    expect(readSnapshotImageDimensions('not base64 at all!')).toBeNull()
  })

  it('lets a phone and a tablet screenshot through', () => {
    expect(findOversizedSnapshotImage(pngHeader(1080, 2400), pngHeader(1080, 2400))).toBeNull()
    expect(findOversizedSnapshotImage(pngHeader(2048, 2732), pngHeader(2048, 2732))).toBeNull()
    expect(findOversizedSnapshotImage('', pngHeader(1080, 2400))).toBeNull()
  })

  it('names the image that is over the limit', () => {
    expect(MAX_SNAPSHOT_DIFF_PIXELS).toBe(8_000_000)
    expect(findOversizedSnapshotImage(pngHeader(1080, 2400), pngHeader(4000, 2100))).toEqual({
      width: 4000,
      height: 2100
    })
    expect(findOversizedSnapshotImage(pngHeader(4000, 2100), pngHeader(1080, 2400))).toEqual({
      width: 4000,
      height: 2100
    })
  })

  it('counts the canvas both images span, even when each one fits', () => {
    expect(findOversizedSnapshotImage(pngHeader(7000, 1000), pngHeader(1000, 7000))).toEqual({
      width: 7000,
      height: 7000
    })
  })

  it('does not guess when a header cannot be read', () => {
    expect(findOversizedSnapshotImage('AAAA', 'AAAA')).toBeNull()
  })
})
