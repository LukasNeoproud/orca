import { gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { decodeFileChunkFrame } from '../../../../shared/file-chunk-frame-protocol'
import type { RpcBinarySender } from '../rpc-binary-sender'
import { encodeFileChunkForTransfer } from './file-chunk-transfer-encoding'

const token = '00112233445566778899aabbccddeeff'

function chunkOf(raw: Buffer): { contentBase64: string; bytesRead: number; eof: boolean } {
  return { contentBase64: raw.toString('base64'), bytesRead: raw.length, eof: false }
}

describe('encodeFileChunkForTransfer', () => {
  it('gzips the raw bytes of a compressible chunk', async () => {
    const raw = Buffer.alloc(64 * 1024, 'native library bytes ')
    const chunk = await encodeFileChunkForTransfer(chunkOf(raw), { acceptGzip: true })

    expect(chunk).toMatchObject({ encoding: 'gzip', bytesRead: raw.length, eof: false })
    expect(chunk.contentBase64.length).toBeLessThan(raw.length / 10)
    expect(gunzipSync(Buffer.from(chunk.contentBase64, 'base64'))).toEqual(raw)
  })

  it('leaves a chunk that gzip cannot shrink as it was', async () => {
    const chunk = chunkOf(randomBytes(4096))
    expect(await encodeFileChunkForTransfer(chunk, { acceptGzip: true })).toBe(chunk)
  })

  it('leaves the chunk alone for a caller that asked for nothing', async () => {
    const chunk = chunkOf(Buffer.alloc(4096, 'a'))
    expect(await encodeFileChunkForTransfer(chunk, {})).toBe(chunk)
  })

  it('sends the bytes in a binary frame and leaves the reply without content', async () => {
    const raw = randomBytes(4096)
    const sendBinary = vi.fn<RpcBinarySender>()
    const chunk = await encodeFileChunkForTransfer(chunkOf(raw), {
      acceptGzip: true,
      binaryFrameToken: token,
      sendBinary
    })

    expect(chunk).toEqual({
      contentBase64: '',
      bytesRead: raw.length,
      eof: false,
      binaryFrame: true
    })
    const frame = decodeFileChunkFrame(sendBinary.mock.calls[0]![0])
    expect(frame).toMatchObject({ token, encoding: 'identity' })
    expect(Buffer.from(frame!.bytes)).toEqual(raw)
  })

  it('gzips a compressible chunk inside its binary frame', async () => {
    const raw = Buffer.alloc(64 * 1024, 'native library bytes ')
    const sendBinary = vi.fn<RpcBinarySender>()
    const chunk = await encodeFileChunkForTransfer(chunkOf(raw), {
      binaryFrameToken: token,
      sendBinary
    })

    expect(chunk).toMatchObject({ contentBase64: '', encoding: 'gzip', binaryFrame: true })
    const frame = decodeFileChunkFrame(sendBinary.mock.calls[0]![0])
    expect(gunzipSync(frame!.bytes)).toEqual(raw)
  })

  it('falls back to the reply when the frame cannot be queued or there is no binary lane', async () => {
    const raw = Buffer.alloc(64 * 1024, 'native library bytes ')
    const refused = await encodeFileChunkForTransfer(chunkOf(raw), {
      acceptGzip: true,
      binaryFrameToken: token,
      sendBinary: () => false
    })
    const noLane = await encodeFileChunkForTransfer(chunkOf(raw), {
      acceptGzip: true,
      binaryFrameToken: token
    })

    for (const chunk of [refused, noLane]) {
      expect(chunk.binaryFrame).toBeUndefined()
      expect(gunzipSync(Buffer.from(chunk.contentBase64, 'base64'))).toEqual(raw)
    }
  })
})
