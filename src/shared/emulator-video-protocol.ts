export type EmulatorVideoCodec = 'h264' | 'hevc' | 'av1'

export type EmulatorVideoFrame = {
  codec: EmulatorVideoCodec
  subscriptionId: string
  seq: number
  config: boolean
  keyFrame: boolean
  width: number
  height: number
  timestampUs: number
  data: Uint8Array
}

export const EMULATOR_VIDEO_KIND = 0x65
export const EMULATOR_VIDEO_VERSION = 1
export const EMULATOR_VIDEO_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
export const EMULATOR_VIDEO_MAX_SUBSCRIPTION_ID_BYTES = 128
const HEADER_BYTES = 26
const MAX_UINT32 = 0xffffffff
const MAX_UINT16 = 0xffff

function codecByte(codec: EmulatorVideoCodec): number {
  if (codec === 'h264') {
    return 1
  }
  if (codec === 'hevc') {
    return 2
  }
  if (codec === 'av1') {
    return 3
  }
  throw new Error('Unsupported emulator video codec')
}

function byteCodec(value: number): EmulatorVideoCodec | null {
  if (value === 1) {
    return 'h264'
  }
  if (value === 2) {
    return 'hevc'
  }
  if (value === 3) {
    return 'av1'
  }
  return null
}

function validInteger(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= max
}

export function encodeEmulatorVideoFrame(frame: EmulatorVideoFrame): Uint8Array {
  const subscription = new TextEncoder().encode(frame.subscriptionId)
  if (
    !subscription.byteLength ||
    subscription.byteLength > EMULATOR_VIDEO_MAX_SUBSCRIPTION_ID_BYTES ||
    !validInteger(frame.seq, MAX_UINT32) ||
    !validInteger(frame.width, MAX_UINT16) ||
    !validInteger(frame.height, MAX_UINT16) ||
    !validInteger(frame.timestampUs, Number.MAX_SAFE_INTEGER) ||
    !frame.data.byteLength ||
    frame.data.byteLength > EMULATOR_VIDEO_MAX_PAYLOAD_BYTES
  ) {
    throw new Error('Invalid emulator video frame')
  }
  const bytes = new Uint8Array(HEADER_BYTES + subscription.byteLength + frame.data.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, EMULATOR_VIDEO_KIND)
  view.setUint8(1, EMULATOR_VIDEO_VERSION)
  view.setUint8(2, codecByte(frame.codec))
  view.setUint8(3, (frame.config ? 1 : 0) | (frame.keyFrame ? 2 : 0))
  view.setUint32(4, frame.seq, true)
  view.setUint16(8, frame.width, true)
  view.setUint16(10, frame.height, true)
  view.setUint32(12, frame.timestampUs % 0x100000000, true)
  view.setUint32(16, Math.floor(frame.timestampUs / 0x100000000), true)
  view.setUint16(20, subscription.byteLength, true)
  view.setUint32(22, frame.data.byteLength, true)
  bytes.set(subscription, HEADER_BYTES)
  bytes.set(frame.data, HEADER_BYTES + subscription.byteLength)
  return bytes
}

export function decodeEmulatorVideoFrame(bytes: Uint8Array): EmulatorVideoFrame | null {
  if (bytes.byteLength < HEADER_BYTES) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(0) !== EMULATOR_VIDEO_KIND || view.getUint8(1) !== EMULATOR_VIDEO_VERSION) {
    return null
  }
  const codec = byteCodec(view.getUint8(2))
  const flags = view.getUint8(3)
  const subscriptionLength = view.getUint16(20, true)
  const payloadLength = view.getUint32(22, true)
  const timestamp = view.getUint32(12, true) + view.getUint32(16, true) * 0x100000000
  if (
    !codec ||
    (flags & ~3) !== 0 ||
    !subscriptionLength ||
    subscriptionLength > EMULATOR_VIDEO_MAX_SUBSCRIPTION_ID_BYTES ||
    !payloadLength ||
    payloadLength > EMULATOR_VIDEO_MAX_PAYLOAD_BYTES ||
    !Number.isSafeInteger(timestamp) ||
    HEADER_BYTES + subscriptionLength + payloadLength !== bytes.byteLength
  ) {
    return null
  }
  let subscriptionId: string
  try {
    subscriptionId = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(HEADER_BYTES, HEADER_BYTES + subscriptionLength)
    )
  } catch {
    return null
  }
  if (!subscriptionId) {
    return null
  }
  return {
    codec,
    subscriptionId,
    seq: view.getUint32(4, true),
    config: (flags & 1) !== 0,
    keyFrame: (flags & 2) !== 0,
    width: view.getUint16(8, true),
    height: view.getUint16(10, true),
    timestampUs: timestamp,
    data: bytes.subarray(HEADER_BYTES + subscriptionLength)
  }
}
