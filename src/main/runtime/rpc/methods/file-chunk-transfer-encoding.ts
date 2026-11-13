import { encodeFileChunkFrame } from '../../../../shared/file-chunk-frame-protocol'
import type { RuntimeFileReadChunkResult } from '../../../../shared/runtime-types'
import type { RpcBinarySender } from '../rpc-binary-sender'
import { encodeMobileWebBundleRange } from './mobile-web-bundle-range-encoding'

/**
 * Sends a chunk the cheapest way its caller can take. Base64 inside a JSON reply costs a third
 * more than the bytes, and the reply's text frame is base64 again; a binary frame is neither.
 */
export async function encodeFileChunkForTransfer(
  chunk: RuntimeFileReadChunkResult,
  options: {
    acceptGzip?: boolean
    binaryFrameToken?: string
    /** Set only for a caller that reads binary frames itself, not one forwarding the call. */
    sendBinary?: RpcBinarySender
  }
): Promise<RuntimeFileReadChunkResult> {
  const frameToken = options.sendBinary ? options.binaryFrameToken : undefined
  if (!options.acceptGzip && !frameToken) {
    return chunk
  }
  const encoded = await encodeMobileWebBundleRange(Buffer.from(chunk.contentBase64, 'base64'))
  const encoding = encoded.encoding === 'gzip' ? { encoding: 'gzip' as const } : {}
  if (
    frameToken &&
    options.sendBinary?.(
      encodeFileChunkFrame({ token: frameToken, encoding: encoded.encoding, bytes: encoded.bytes })
    ) !== false
  ) {
    // The frame is queued ahead of this reply on the same socket.
    return { ...chunk, ...encoding, contentBase64: '', binaryFrame: true }
  }
  if (encoded.encoding !== 'gzip' || !options.acceptGzip) {
    return chunk
  }
  return { ...chunk, ...encoding, contentBase64: encoded.bytes.toString('base64') }
}
