import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  frameGzipCompressedPayload,
  inflateE2EEPayload,
  isGzipCompressedPayload
} from './e2ee-payload-compression'

const inflate = (gzip: Uint8Array): Uint8Array => Uint8Array.from(gunzipSync(gzip))

describe('E2EE payload compression framing', () => {
  it('round-trips a gzip-framed payload', () => {
    const payload = new TextEncoder().encode('{"id":"1","ok":true}'.repeat(50))
    const framed = frameGzipCompressedPayload(gzipSync(payload))
    expect(isGzipCompressedPayload(framed)).toBe(true)
    expect(inflateE2EEPayload(framed, inflate)).toEqual(payload)
  })

  it('passes JSON and every binary frame kind through untouched', () => {
    for (const first of ['{'.charCodeAt(0), 0x74, 0x62, 0x65, 0x6e]) {
      const payload = Uint8Array.of(first, 1, 2, 3)
      expect(inflateE2EEPayload(payload, undefined)).toBe(payload)
    }
  })

  it('refuses a compressed payload it cannot inflate or that is corrupt', () => {
    const framed = frameGzipCompressedPayload(gzipSync(Uint8Array.of(1, 2, 3)))
    expect(inflateE2EEPayload(framed, undefined)).toBeNull()
    expect(
      inflateE2EEPayload(frameGzipCompressedPayload(Uint8Array.of(9, 9, 9)), inflate)
    ).toBeNull()
  })
})
