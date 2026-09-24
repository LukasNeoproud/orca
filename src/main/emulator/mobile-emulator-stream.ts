import { randomUUID } from 'node:crypto'
import type { EmulatorBridge } from './emulator-bridge'
import type { EmulatorDevice } from './backends/emulator-backend'
import { MobileEmulatorFrameSender } from './mobile-emulator-frame-sender'
import { scrcpyVideoRegistry } from './scrcpy-video-registry'
import type { ScrcpyStreamSession } from './android/scrcpy-stream-session'
import { MobileEmulatorIosSource } from './mobile-emulator-ios-source'
import { startMobileAndroidEncodedSession } from './mobile-emulator-android-source'
import { MobileEmulatorAndroidJpegSource } from './mobile-emulator-android-jpeg-source'
import type { MobileEmulatorEncodedSender } from './mobile-emulator-encoded-sender'
import {
  MOBILE_EMULATOR_PROFILES,
  type MobileEmulatorAction,
  type MobileEmulatorProfile,
  type MobileEmulatorVideoCodec
} from './mobile-emulator-contract'
import type { MobileEmulatorStreamHostArgs } from '../host/mobile-emulator-stream-host'
export { mobileEmulatorDevices } from './mobile-emulator-contract'

type MobileEmulatorStreamArgs = MobileEmulatorStreamHostArgs

class MobileEmulatorStream {
  readonly subscriptionId = `emulator-mobile:${randomUUID()}`
  readonly connectionId: string
  private readonly workspaceId = this.subscriptionId
  private readonly profile: (typeof MOBILE_EMULATOR_PROFILES)[MobileEmulatorProfile]
  private readonly bridge: EmulatorBridge
  private readonly device: EmulatorDevice
  private readonly frames: MobileEmulatorFrameSender
  private readonly emit: MobileEmulatorStreamArgs['emit']
  private readonly sendBinary: MobileEmulatorStreamArgs['sendBinary']
  private readonly removeCleanup: MobileEmulatorStreamArgs['removeCleanup']
  private readonly signal?: AbortSignal
  private readonly videoCodecs: MobileEmulatorVideoCodec[]
  private readonly onAbort = (): void => this.stop()
  private activeDeviceId: string | null = null
  private iosSource: MobileEmulatorIosSource | null = null
  private androidJpegSource: MobileEmulatorAndroidJpegSource | null = null
  private encodedSender: MobileEmulatorEncodedSender | null = null
  private androidVideoSession: ScrcpyStreamSession | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private touching = false
  private touchPoint = { x: 0, y: 0 }
  private stopped = false
  private resolving!: () => void
  readonly done = new Promise<void>((resolve) => {
    this.resolving = resolve
  })

  constructor(args: MobileEmulatorStreamArgs) {
    this.connectionId = args.connectionId
    this.bridge = args.bridge
    this.device = args.device
    this.profile = MOBILE_EMULATOR_PROFILES[args.profile]
    this.frames = new MobileEmulatorFrameSender(this.profile, args.sendBinary)
    this.emit = args.emit
    this.sendBinary = args.sendBinary
    this.removeCleanup = args.removeCleanup
    this.signal = args.signal
    this.videoCodecs = args.videoCodecs ?? ['jpeg']
    args.registerCleanup(this.subscriptionId, () => this.stop(), args.connectionId)
    args.signal?.addEventListener('abort', this.onAbort, { once: true })
    if (args.signal?.aborted) {
      this.stop()
    }
  }

  async start(): Promise<void> {
    if (this.stopped) {
      return
    }
    try {
      const lease = await this.bridge.acquireHelperForDevice(this.device.id)
      const info = lease.info
      this.activeDeviceId = info.deviceUdid
      this.bridge.registerActiveEmulator(this.workspaceId, info, {
        managed: false,
        backend: this.device.backend
      })
      await lease.release()
      if (this.stopped) {
        await this.bridge.stopActiveForWorktree(this.workspaceId, { shutdownDevice: false })
        return
      }
      if (info.streamCodec === 'h264' && this.videoCodecs[0] !== 'jpeg') {
        const encoded = await startMobileAndroidEncodedSession({
          bridge: this.bridge,
          serial: info.deviceUdid,
          profile: this.profile,
          videoCodecs: this.videoCodecs,
          subscriptionId: this.subscriptionId,
          device: this.device,
          sendBinary: this.sendBinary,
          emit: this.emit,
          fail: (error) => this.fail(error),
          isStopped: () => this.stopped
        })
        if (encoded) {
          this.androidVideoSession = encoded.session
          this.encodedSender = encoded.sender
          this.startHeartbeat()
          return
        }
        if (this.stopped) {
          return
        }
      }
      if (info.streamCodec === 'h264') {
        this.androidJpegSource = new MobileEmulatorAndroidJpegSource(
          info.deviceUdid,
          this.subscriptionId,
          this.device,
          this.profile,
          this.frames,
          this.emit,
          (error) => this.fail(error)
        )
        await this.androidJpegSource.start()
      } else {
        this.iosSource = new MobileEmulatorIosSource(
          info.streamUrl,
          info.wsUrl,
          this.subscriptionId,
          this.device,
          this.profile,
          this.videoCodecs,
          this.sendBinary,
          this.frames,
          this.emit,
          (error) => this.fail(error)
        )
        await this.iosSource.start()
      }
      if (!this.stopped) {
        this.startHeartbeat()
      }
    } catch (error) {
      this.fail(error)
    }
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      const lastFrameAt =
        this.iosSource?.lastFrameAt ?? this.encodedSender?.lastFrameAt ?? this.frames.lastFrameAt
      if (this.stopped || lastFrameAt === 0) {
        return
      }
      if (
        this.device.backend === 'android'
          ? this.androidVideoSession !== null ||
            scrcpyVideoRegistry.has(this.activeDeviceId ?? this.device.id)
          : Date.now() - lastFrameAt < 10_000
      ) {
        this.emit({ type: 'heartbeat', subscriptionId: this.subscriptionId })
      }
    }, 5_000)
  }

  async input(action: MobileEmulatorAction): Promise<void> {
    if (this.stopped) {
      throw new Error('Emulator stream has ended')
    }
    const target = { device: this.device.id }
    if (action.type === 'touch') {
      if (this.androidVideoSession && action.videoWidth && action.videoHeight) {
        this.androidVideoSession.setVideoSize(action.videoWidth, action.videoHeight)
      }
      this.sendTouch(action.phase, action.x, action.y)
    } else if (action.type === 'tap') {
      await this.bridge.tap(action.x, action.y, target)
    } else if (action.type === 'gesture') {
      await this.bridge.gesture(action.points, target)
    } else if (action.type === 'type') {
      await this.bridge.type(action.text, target)
    } else {
      await this.bridge.button(action.name, target)
    }
  }

  private sendTouch(phase: 'down' | 'move' | 'up' | 'cancel', x: number, y: number): void {
    if (phase !== 'down' && !this.touching) {
      return
    }
    this.touchPoint = { x, y }
    if (this.device.backend === 'android') {
      const ok = this.androidVideoSession
        ? this.androidVideoSession.sendTouch(phase, x, y)
        : scrcpyVideoRegistry.sendTouch(this.activeDeviceId ?? this.device.id, phase, x, y)
      if (!ok) {
        throw new Error('Android touch control is unavailable')
      }
    } else {
      this.iosSource?.sendTouch(phase, x, y)
    }
    if (phase === 'down') {
      this.touching = true
    } else if (phase === 'up' || phase === 'cancel') {
      this.touching = false
    }
  }

  private fail(error: unknown): void {
    if (this.stopped) {
      return
    }
    this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    this.stop()
  }

  stop(): void {
    if (this.stopped) {
      return
    }
    if (this.touching) {
      try {
        this.sendTouch('cancel', this.touchPoint.x, this.touchPoint.y)
      } catch {
        /* connection gone */
      }
    }
    this.stopped = true
    this.signal?.removeEventListener('abort', this.onAbort)
    this.iosSource?.stop()
    this.androidJpegSource?.stop()
    this.encodedSender?.stop()
    this.androidVideoSession?.close()
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
    }
    this.frames.stop()
    mobileEmulatorStreams.delete(this.subscriptionId)
    this.removeCleanup(this.subscriptionId)
    void this.bridge
      .stopActiveForWorktree(this.workspaceId, { shutdownDevice: false })
      .catch(() => {})
    this.emit({ type: 'end', subscriptionId: this.subscriptionId })
    this.resolving()
  }
}

const mobileEmulatorStreams = new Map<string, MobileEmulatorStream>()

export async function startMobileEmulatorStream(args: MobileEmulatorStreamArgs): Promise<void> {
  if (args.signal?.aborted) {
    return
  }
  const stream = new MobileEmulatorStream(args)
  if (args.signal?.aborted) {
    stream.stop()
    return
  }
  mobileEmulatorStreams.set(stream.subscriptionId, stream)
  args.emit({ type: 'starting', subscriptionId: stream.subscriptionId })
  void stream.start()
  try {
    await stream.done
  } finally {
    mobileEmulatorStreams.delete(stream.subscriptionId)
  }
}

export function stopMobileEmulatorStream(subscriptionId: string, connectionId: string): boolean {
  const stream = mobileEmulatorStreams.get(subscriptionId)
  if (!stream || stream.connectionId !== connectionId) {
    return false
  }
  stream.stop()
  return true
}

export async function sendMobileEmulatorInput(
  subscriptionId: string,
  connectionId: string,
  action: MobileEmulatorAction
): Promise<void> {
  const stream = mobileEmulatorStreams.get(subscriptionId)
  if (!stream || stream.connectionId !== connectionId) {
    throw new Error('Emulator subscription is unavailable on this connection')
  }
  await stream.input(action)
}
