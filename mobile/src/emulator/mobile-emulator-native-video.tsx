import { Buffer } from 'buffer'
import { nativeEmulatorVideo } from '@orca/expo-emulator-video'
import type { NativeVideoCapabilities } from '@orca/expo-emulator-video'
import { requireNativeViewManager } from 'expo-modules-core'
import type { ComponentType } from 'react'
import { View } from 'react-native'
import type { EmulatorVideoFrame } from '../../../src/shared/emulator-video-protocol'

export type EmulatorEncodedVideoFrame = EmulatorVideoFrame

export type EmulatorVideoCapability = Record<EmulatorEncodedVideoFrame['codec'], boolean>

type VideoViewEvent<T> = { nativeEvent: T }
type VideoViewProps = {
  streamId: string
  style?: object
  onRendered?: (event: VideoViewEvent<{ width: number; height: number }>) => void
  onError?: (event: VideoViewEvent<{ message: string }>) => void
}

const FallbackVideoView: ComponentType<VideoViewProps> = ({ style }) => <View style={style} />
const NativeVideoView: ComponentType<VideoViewProps> = nativeEmulatorVideo
  ? requireNativeViewManager('ExpoEmulatorVideo')
  : FallbackVideoView

export function NativeEmulatorVideoView(props: VideoViewProps) {
  return <NativeVideoView {...props} />
}

export async function getMobileEmulatorVideoCapabilities(): Promise<EmulatorVideoCapability> {
  if (!nativeEmulatorVideo) {
    return { h264: false, hevc: false, av1: false }
  }
  try {
    const capabilities: NativeVideoCapabilities = await nativeEmulatorVideo.getCapabilities()
    return {
      h264: capabilities.h264.supported,
      hevc: capabilities.hevc.supported,
      av1: capabilities.av1.supported
    }
  } catch {
    return { h264: false, hevc: false, av1: false }
  }
}

export async function submitMobileEmulatorVideoFrame(frame: EmulatorEncodedVideoFrame) {
  if (!nativeEmulatorVideo) {
    throw new Error('Native emulator video decoder is unavailable.')
  }
  return nativeEmulatorVideo.submit({
    streamId: frame.subscriptionId,
    codec: frame.codec,
    width: frame.width,
    height: frame.height,
    seq: frame.seq,
    config: frame.config,
    keyFrame: frame.keyFrame,
    timestampUs: frame.timestampUs,
    dataBase64: Buffer.from(frame.data).toString('base64')
  })
}

export async function closeMobileEmulatorVideoStream(subscriptionId: string) {
  await nativeEmulatorVideo?.close(subscriptionId)
}
