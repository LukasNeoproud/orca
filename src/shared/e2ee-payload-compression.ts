// Why a leading kind byte: every binary payload the host sends opens with its own kind byte
// (terminal `t`, screencast `b`, emulator `e`, tunnel `n`) and every text payload is a JSON object,
// so `z` cannot be mistaken for an uncompressed payload of either kind.
const COMPRESSED_PAYLOAD_KIND = 0x7a
const GZIP_FORMAT = 1
const HEADER_BYTES = 2

/** Advertised by a client that inflates `z`-framed payloads; a host compresses only toward it. */
export const E2EE_GZIP_PAYLOADS_CLIENT_CAPABILITY = 'e2ee.payloads.gzip.v1' as const

export function isGzipCompressedPayload(payload: Uint8Array): boolean {
  return (
    payload.length > HEADER_BYTES &&
    payload[0] === COMPRESSED_PAYLOAD_KIND &&
    payload[1] === GZIP_FORMAT
  )
}

export function gzipCompressedPayloadBody(payload: Uint8Array): Uint8Array {
  return payload.subarray(HEADER_BYTES)
}

export function frameGzipCompressedPayload(gzip: Uint8Array): Uint8Array<ArrayBuffer> {
  const framed = new Uint8Array(HEADER_BYTES + gzip.length)
  framed[0] = COMPRESSED_PAYLOAD_KIND
  framed[1] = GZIP_FORMAT
  framed.set(gzip, HEADER_BYTES)
  return framed
}

/** The payload as sent, or `null` when it is compressed and this side cannot inflate it. */
export function inflateE2EEPayload(
  payload: Uint8Array,
  inflateGzip: ((gzip: Uint8Array) => Uint8Array) | undefined
): Uint8Array | null {
  if (!isGzipCompressedPayload(payload)) {
    return payload
  }
  if (!inflateGzip) {
    return null
  }
  try {
    return inflateGzip(gzipCompressedPayloadBody(payload))
  } catch {
    return null
  }
}
