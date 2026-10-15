import { gzipSync } from 'node:zlib'
import { frameGzipCompressedPayload } from '../../../shared/e2ee-payload-compression'

// Why a floor: below ~1 KiB the gzip header and Huffman tables eat most of the saving.
const MIN_COMPRESSIBLE_BYTES = 1024
// Why level 5: within a few percent of level 9 on JSON and ANSI, at a fraction of the CPU.
const GZIP_LEVEL = 5
const TERMINAL_STREAM_KIND = 0x74

/**
 * Gzip-frames a payload bound for a client that can inflate it, or returns it untouched.
 *
 * Binary payloads are compressed only when they are terminal stream frames: screencast and
 * emulator frames are already JPEG or video, and tunnel bytes are often compressed too.
 */
export function compressMobileE2EEPayload(
  payload: Uint8Array,
  kind: 'text' | 'binary'
): Uint8Array {
  if (payload.length < MIN_COMPRESSIBLE_BYTES) {
    return payload
  }
  if (kind === 'binary' && payload[0] !== TERMINAL_STREAM_KIND) {
    return payload
  }
  const gzip = gzipSync(payload, { level: GZIP_LEVEL })
  const framed = frameGzipCompressedPayload(gzip)
  return framed.length < payload.length ? framed : payload
}
