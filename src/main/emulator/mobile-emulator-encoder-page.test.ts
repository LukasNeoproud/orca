import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { mobileEncoderInitialization } from './mobile-emulator-encoder-page'

type FakeEncodedChunk = Pick<EncodedVideoChunk, 'byteLength' | 'timestamp' | 'type' | 'copyTo'>

it('keeps the requested cadence across rounded timestamps without accepting bursts', async () => {
  let now = 0
  let encoded = 0
  const canvas = { width: 640, height: 480, getContext: () => ({ drawImage() {} }) }
  const scope = {
    performance: { now: () => now },
    document: { createElement: () => canvas },
    Blob,
    atob,
    btoa,
    createImageBitmap: async () => ({ width: 640, height: 480, close() {} }),
    VideoFrame: class {
      close() {}
    },
    VideoEncoder: class {
      static async isConfigSupported() {
        return { supported: true }
      }
      encodeQueueSize = 0
      constructor(private callbacks: { output: (chunk: FakeEncodedChunk) => void }) {}
      configure() {}
      reset() {}
      async flush() {}
      encode() {
        encoded++
        this.callbacks.output({
          byteLength: 1,
          timestamp: now * 1000,
          type: 'key',
          copyTo(bytes: Uint8Array) {
            bytes[0] = 1
          }
        })
      }
    },
    __orcaEncodeJpeg: undefined as unknown as (jpeg: string, first: boolean) => Promise<void>
  }
  await runInNewContext(
    mobileEncoderInitialization({
      codec: 'h264',
      width: 640,
      height: 480,
      maxWidth: 640,
      fps: 15,
      bitrate: 2_000_000
    }),
    scope
  )
  await scope.__orcaEncodeJpeg('AA==', true)
  for (let index = 1; index <= 30; index++) {
    now = Math.floor((index * 1000) / 15)
    await scope.__orcaEncodeJpeg('AA==', false)
    await scope.__orcaEncodeJpeg('AA==', false)
  }
  expect(encoded).toBe(31)
  now = 10_000
  await scope.__orcaEncodeJpeg('AA==', false)
  await scope.__orcaEncodeJpeg('AA==', false)
  expect(encoded).toBe(32)
})
