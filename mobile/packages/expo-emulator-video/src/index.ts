import { requireOptionalNativeModule } from 'expo-modules-core'

export type VideoCodec = 'h264' | 'hevc' | 'av1'
export type NativeVideoCapabilities = Record<VideoCodec, { supported: boolean; hardware: boolean }>
export type NativeEncodedFrame = {
  streamId: string
  codec: VideoCodec
  width: number
  height: number
  seq: number
  config: boolean
  keyFrame: boolean
  timestampUs: number
  dataBase64: string
}

export type NativeVideoModule = {
  getCapabilities(): Promise<NativeVideoCapabilities>
  submit(frame: NativeEncodedFrame): Promise<'queued' | 'waiting-for-keyframe' | 'dropped'>
  close(streamId: string): Promise<void>
}

export const nativeEmulatorVideo =
  requireOptionalNativeModule<NativeVideoModule>('ExpoEmulatorVideo')
