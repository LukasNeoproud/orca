import { describe, expect, it } from 'vitest'
import { encodeScrcpyTouchFrame } from './scrcpy-touch-frame'

describe('scrcpy 2.4 touch control frame', () => {
  it('encodes one down event using the pinned 32-byte wire format', () => {
    const frame = encodeScrcpyTouchFrame('down', 0.5, 0.25, 1080, 1920)
    expect(frame.length).toBe(32)
    expect(frame[0]).toBe(2)
    expect(frame[1]).toBe(0)
    expect(frame.readBigUInt64BE(2)).toBe(0n)
    expect(frame.readInt32BE(10)).toBe(540)
    expect(frame.readInt32BE(14)).toBe(480)
    expect(frame.readUInt16BE(18)).toBe(1080)
    expect(frame.readUInt16BE(20)).toBe(1920)
    expect(frame.readUInt16BE(22)).toBe(0xffff)
  })

  it('sends zero pressure on release', () => {
    const frame = encodeScrcpyTouchFrame('up', 1, 1, 1080, 1920)
    expect(frame[1]).toBe(1)
    expect(frame.readUInt16BE(22)).toBe(0)
  })
})
