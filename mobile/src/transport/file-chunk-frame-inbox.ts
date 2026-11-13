import {
  decodeFileChunkFrame,
  FILE_CHUNK_FRAME_KIND,
  type FileChunkFrame
} from '../../../src/shared/file-chunk-frame-protocol'

// Keyed by an unguessable token rather than by connection, so a frame from any paired host
// reaches only the request that named it.
const expected = new Map<string, FileChunkFrame | null>()

export type ExpectedFileChunkFrame = {
  /** Sent as `binaryFrameToken` with one `files.readChunk` request. */
  token: string
  /** The frame, if the host sent one; it arrives before the request's reply. */
  take: () => FileChunkFrame | null
  dispose: () => void
}

/** `token` is 16 bytes from a secure RNG, as lowercase hex. */
export function expectFileChunkFrame(token: string): ExpectedFileChunkFrame {
  expected.set(token, null)
  return {
    token,
    take: () => {
      const frame = expected.get(token) ?? null
      expected.set(token, null)
      return frame
    },
    dispose: () => void expected.delete(token)
  }
}

/** True when the bytes are a file chunk frame, whether or not a request still waits for it. */
export function routeFileChunkFrame(bytes: Uint8Array): boolean {
  if (bytes[0] !== FILE_CHUNK_FRAME_KIND) {
    return false
  }
  const frame = decodeFileChunkFrame(bytes)
  if (frame && expected.has(frame.token)) {
    expected.set(frame.token, frame)
  }
  return true
}
