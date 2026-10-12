import {
  decodeEmulatorVideoFrame,
  EMULATOR_VIDEO_KIND,
  type EmulatorVideoCodec,
  type EmulatorVideoFrame
} from '../../../src/shared/emulator-video-protocol'
import {
  decodeBrowserScreencastFrame,
  type BrowserScreencastFrame
} from './browser-screencast-protocol'

type EmulatorVideoStream = {
  method: string
  cancelled?: boolean
  subscriptionId?: string
  videoCodec?: EmulatorVideoCodec
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
}

export function emulatorVideoCodec(result: unknown): EmulatorVideoCodec | undefined {
  if (!result || typeof result !== 'object') {
    return undefined
  }
  const value = (result as { videoCodec?: unknown }).videoCodec
  return value === 'h264' || value === 'hevc' || value === 'av1' ? value : undefined
}

/** Only a ready emulator stream negotiates a codec; every other reply clears it. */
export function emulatorStreamVideoCodec(
  method: string,
  result: unknown
): EmulatorVideoCodec | undefined {
  return method === 'emulator.mobile.stream' ? emulatorVideoCodec(result) : undefined
}

export function routeMobileImageFrame(
  bytes: Uint8Array,
  stream: EmulatorVideoStream | undefined
): boolean {
  if (bytes[0] !== EMULATOR_VIDEO_KIND) {
    const frame = decodeBrowserScreencastFrame(bytes)
    if (!frame) {
      return false
    }
    if (
      stream &&
      !stream.cancelled &&
      !stream.videoCodec &&
      (stream.method === 'browser.screencast' || stream.method === 'emulator.mobile.stream')
    ) {
      stream.onBinaryFrame?.(frame)
    }
    return true
  }
  if (stream?.method !== 'emulator.mobile.stream' || stream.cancelled) {
    return true
  }
  const frame = decodeEmulatorVideoFrame(bytes)
  if (
    frame &&
    stream.subscriptionId === frame.subscriptionId &&
    stream.videoCodec === frame.codec
  ) {
    stream.onEmulatorVideoFrame?.(frame)
  }
  return true
}
