export const FILE_CHUNK_FRAME_KIND = 0x66
const FILE_CHUNK_FRAME_VERSION = 1
const TOKEN_BYTES = 16
const HEADER_BYTES = 4 + TOKEN_BYTES
const HEX_TOKEN = /^[0-9a-f]{32}$/

export type FileChunkFrameEncoding = 'identity' | 'gzip'

/** One `files.readChunk` chunk on the binary lane, matched to its request by the caller's token. */
export type FileChunkFrame = {
  /** 16 random bytes as lowercase hex, chosen by the caller for one request. */
  token: string
  encoding: FileChunkFrameEncoding
  bytes: Uint8Array
}

export function isFileChunkFrameToken(value: string): boolean {
  return HEX_TOKEN.test(value)
}

export function encodeFileChunkFrame(frame: FileChunkFrame): Uint8Array {
  if (!isFileChunkFrameToken(frame.token)) {
    throw new Error('Invalid file chunk frame token')
  }
  const out = new Uint8Array(HEADER_BYTES + frame.bytes.length)
  out[0] = FILE_CHUNK_FRAME_KIND
  out[1] = FILE_CHUNK_FRAME_VERSION
  out[2] = frame.encoding === 'gzip' ? 1 : 0
  for (let index = 0; index < TOKEN_BYTES; index++) {
    out[4 + index] = Number.parseInt(frame.token.slice(index * 2, index * 2 + 2), 16)
  }
  out.set(frame.bytes, HEADER_BYTES)
  return out
}

export function decodeFileChunkFrame(bytes: Uint8Array): FileChunkFrame | null {
  if (
    bytes.length < HEADER_BYTES ||
    bytes[0] !== FILE_CHUNK_FRAME_KIND ||
    bytes[1] !== FILE_CHUNK_FRAME_VERSION ||
    bytes[2]! > 1
  ) {
    return null
  }
  let token = ''
  for (let index = 0; index < TOKEN_BYTES; index++) {
    token += bytes[4 + index]!.toString(16).padStart(2, '0')
  }
  return {
    token,
    encoding: bytes[2] === 1 ? 'gzip' : 'identity',
    bytes: bytes.subarray(HEADER_BYTES)
  }
}
