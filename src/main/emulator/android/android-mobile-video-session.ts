import type { AndroidCommandRunner } from './android-command-runner'
import type { AndroidSdkPaths } from './android-sdk-discovery'
import { ScrcpyStreamSession, type ScrcpyStreamCallbacks } from './scrcpy-stream-session'

export type AndroidMobileVideoSessionRequest = {
  serial: string
  codec: 'h264' | 'h265' | 'av1'
  profile: { width: number; fps: number; bitRate: number }
  callbacks: ScrcpyStreamCallbacks
}

export function startAndroidMobileVideoSession(
  request: AndroidMobileVideoSessionRequest & {
    runner: AndroidCommandRunner
    sdk: AndroidSdkPaths
    jarPath: string
  }
): Promise<ScrcpyStreamSession> {
  return ScrcpyStreamSession.start(
    {
      runner: request.runner,
      sdk: request.sdk,
      serial: request.serial,
      localJarPath: request.jarPath,
      videoCodec: request.codec,
      maxSize: request.profile.width,
      maxFps: request.profile.fps,
      videoBitRate: request.profile.bitRate
    },
    request.callbacks
  )
}
