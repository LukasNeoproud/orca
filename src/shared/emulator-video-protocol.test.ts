import { describe, expect, it } from 'vitest'
import {
  decodeEmulatorVideoFrame,
  encodeEmulatorVideoFrame,
  EMULATOR_VIDEO_MAX_PAYLOAD_BYTES,
  type EmulatorVideoCodec,
  type EmulatorVideoFrame
} from './emulator-video-protocol'

const frame = (codec: EmulatorVideoCodec): EmulatorVideoFrame => ({
  codec,
  subscriptionId: 'emulator-mobile:é-1',
  seq: 0xffffffff,
  config: false,
  keyFrame: true,
  width: 1170,
  height: 2532,
  timestampUs: 5_000_000_123,
  data: new Uint8Array([0, 1, 2, 255])
})

describe('emulator video protocol', () => {
  it.each<EmulatorVideoCodec>(['h264', 'hevc', 'av1'])(
    'round trips %s with an offset view',
    (codec) => {
      const encoded = encodeEmulatorVideoFrame(frame(codec))
      const padded = new Uint8Array(encoded.length + 3)
      padded.set(encoded, 2)
      expect(decodeEmulatorVideoFrame(padded.subarray(2, -1))).toEqual(frame(codec))
    }
  )

  it('rejects unknown version, codec, flags and truncated or extra bytes', () => {
    const encoded = encodeEmulatorVideoFrame(frame('h264'))
    for (const [offset, value] of [
      [1, 2],
      [2, 4],
      [3, 0x80]
    ] as const) {
      const invalid = encoded.slice()
      invalid[offset] = value
      expect(decodeEmulatorVideoFrame(invalid)).toBeNull()
    }
    expect(decodeEmulatorVideoFrame(encoded.subarray(0, -1))).toBeNull()
    expect(decodeEmulatorVideoFrame(new Uint8Array([...encoded, 0]))).toBeNull()
  })

  it('rejects unsafe timestamp, oversized payload, invalid ID and lengths', () => {
    const encoded = encodeEmulatorVideoFrame(frame('av1'))
    const unsafeTime = encoded.slice()
    unsafeTime.fill(0xff, 12, 20)
    expect(decodeEmulatorVideoFrame(unsafeTime)).toBeNull()
    const badId = encoded.slice()
    badId[26] = 0xff
    expect(decodeEmulatorVideoFrame(badId)).toBeNull()
    const badLength = encoded.slice()
    new DataView(badLength.buffer).setUint32(22, EMULATOR_VIDEO_MAX_PAYLOAD_BYTES + 1, true)
    expect(decodeEmulatorVideoFrame(badLength)).toBeNull()
    expect(() =>
      encodeEmulatorVideoFrame({ ...frame('h264'), subscriptionId: 'a'.repeat(129) })
    ).toThrow()
    expect(() => encodeEmulatorVideoFrame({ ...frame('h264'), data: new Uint8Array(0) })).toThrow()
  })
})
