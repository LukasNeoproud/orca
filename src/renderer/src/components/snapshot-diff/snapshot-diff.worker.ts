import { imagePixelDifference } from '../editor/image-pixel-difference'
import { findSnapshotChangeRegions } from './snapshot-change-regions'
import { paintSnapshotChangeSides, splitSnapshotChangeSides } from './snapshot-change-sides'
import type {
  SnapshotDiffRequest,
  SnapshotDiffResult,
  SnapshotDiffWorkerRequest,
  SnapshotDiffWorkerResponse
} from './snapshot-diff-worker-protocol'

const BASE64_CHUNK_BYTES = 0x8000

function bytesOfBase64(content: string): Uint8Array<ArrayBuffer> {
  const binary = atob(content.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function base64OfBytes(bytes: Uint8Array): string {
  let binary = ''
  // Why chunked: spreading a whole image into one call overflows the argument limit.
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES))
  }
  return btoa(binary)
}

function decode(mimeType: string, content: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytesOfBase64(content)], { type: mimeType }))
}

function contextOf(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas 2D is unavailable.')
  }
  return context
}

async function pngOf(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return base64OfBytes(new Uint8Array(await blob.arrayBuffer()))
}

async function compare(request: SnapshotDiffRequest): Promise<SnapshotDiffResult> {
  const [original, modified] = await Promise.all([
    decode(request.mimeType, request.originalContent),
    decode(request.mimeType, request.modifiedContent)
  ])
  // Both images drawn at the larger size, so a resized snapshot shows its new edge as changed.
  const width = Math.max(original.width, modified.width)
  const height = Math.max(original.height, modified.height)
  if (width <= 0 || height <= 0) {
    throw new Error('The images have no pixels to compare.')
  }
  if (width * height > request.maxPixels) {
    original.close()
    modified.close()
    return { kind: 'too-large', width, height }
  }
  const canvas = new OffscreenCanvas(width, height)
  const context = contextOf(canvas)
  const pixelsOf = (image: ImageBitmap): Uint8ClampedArray => {
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0)
    image.close()
    return context.getImageData(0, 0, width, height).data
  }
  const originalPixels = pixelsOf(original)
  const modifiedPixels = pixelsOf(modified)
  const changedMask = new Uint8Array(width * height)
  const { pixels, changedPixels } = imagePixelDifference(originalPixels, modifiedPixels, {
    changedMask
  })
  const regions = findSnapshotChangeRegions(changedMask, width, height)
  splitSnapshotChangeSides(
    { original: originalPixels, modified: modifiedPixels, width, height },
    changedMask,
    regions
  )
  paintSnapshotChangeSides(pixels, changedMask, request)
  const image = new ImageData(pixels, width, height)
  context.putImageData(image, 0, 0)
  const highlightContent = await pngOf(canvas)
  // Why in place: a second result buffer would add 4 bytes per pixel for one encode.
  for (let pixel = 0; pixel < changedMask.length; pixel += 1) {
    if (changedMask[pixel] !== 0) {
      const index = pixel * 4
      pixels[index] = modifiedPixels[index]
      pixels[index + 1] = modifiedPixels[index + 1]
      pixels[index + 2] = modifiedPixels[index + 2]
      pixels[index + 3] = modifiedPixels[index + 3]
    }
  }
  context.putImageData(image, 0, 0)
  return {
    kind: 'ready',
    width,
    height,
    changedPixels,
    regions,
    highlightContent,
    plainContent: await pngOf(canvas)
  }
}

self.onmessage = (event: MessageEvent<SnapshotDiffWorkerRequest>): void => {
  const { id, request } = event.data
  const reply = (response: SnapshotDiffWorkerResponse): void => self.postMessage(response)
  compare(request).then(
    (result) => reply({ id, ok: true, result }),
    (error: unknown) =>
      reply({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  )
}
