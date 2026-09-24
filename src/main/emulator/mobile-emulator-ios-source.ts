import WebSocket from 'ws'
import { encodeServeSimTouchFrame } from '../../shared/emulator-touch-frame'
import type { EmulatorDevice } from './backends/emulator-backend'
import { waitForIosTouchSocket } from './ios-emulator-touch-socket'
import { MjpegFrameStream } from './mjpeg-frame-stream'
import { MobileEmulatorEncodedSender } from './mobile-emulator-encoded-sender'
import type { MobileEmulatorFrameSender } from './mobile-emulator-frame-sender'
import { MobileEmulatorVideoEncoder } from './mobile-emulator-video-encoder'
import type { MobileEmulatorVideoCodec } from './mobile-emulator-contract'

type Profile = { width: number; fps: number; jpegQuality: number; bitRate: number }

export class MobileEmulatorIosSource {
  private stream: MjpegFrameStream | null = null
  private touchSocket: WebSocket | null = null
  private encoder: MobileEmulatorVideoEncoder | null = null
  private encodedSender: MobileEmulatorEncodedSender | null = null
  private latestFrame: Buffer | null = null
  private firstResolve: ((frame: Buffer) => void) | null = null
  private firstReject: ((error: Error) => void) | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  private pollBusy = false
  private ready = false
  private stopped = false

  constructor(
    private readonly streamUrl: string,
    private readonly wsUrl: string,
    private readonly subscriptionId: string,
    private readonly device: EmulatorDevice,
    private readonly profile: Profile,
    private readonly videoCodecs: MobileEmulatorVideoCodec[],
    private readonly sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void,
    private readonly frames: MobileEmulatorFrameSender,
    private readonly emit: (value: unknown) => void,
    private readonly fail: (error: unknown) => void
  ) {}

  get lastFrameAt(): number {
    return this.encodedSender?.lastFrameAt ?? this.frames.lastFrameAt
  }

  async start(): Promise<void> {
    this.stream = new MjpegFrameStream(this.streamUrl, {
      onError: (message) => this.fail(new Error(message)),
      onFrame: (frame) => this.onFrame(frame)
    })
    this.touchSocket = new WebSocket(this.wsUrl)
    await waitForIosTouchSocket(this.touchSocket)
    if (this.stopped) {
      return
    }
    this.touchSocket.on('error', (error) => this.fail(error))
    this.touchSocket.on('close', () => {
      if (!this.stopped) {
        this.fail(new Error('iOS touch control closed'))
      }
    })
    if (this.videoCodecs[0] === 'jpeg') {
      this.readyJpeg()
      this.stream.start()
      return
    }
    const firstFrame = new Promise<Buffer>((resolve, reject) => {
      this.firstResolve = resolve
      this.firstReject = reject
    })
    const timeout = setTimeout(
      () => this.firstReject?.(new Error('No simulator video frame')),
      15_000
    )
    this.stream.start()
    let firstJpeg: Buffer
    try {
      firstJpeg = await firstFrame
    } finally {
      clearTimeout(timeout)
      this.firstResolve = null
      this.firstReject = null
    }
    if (this.stopped) {
      return
    }
    for (const codec of this.videoCodecs) {
      if (codec === 'jpeg') {
        break
      }
      let encoder: MobileEmulatorVideoEncoder | null = null
      try {
        encoder = await MobileEmulatorVideoEncoder.create(codec, this.profile, firstJpeg)
        if (this.stopped) {
          encoder.close()
          return
        }
        this.encoder = encoder
        const sender = new MobileEmulatorEncodedSender(this.subscriptionId, this.sendBinary)
        this.encodedSender = sender
        this.emit({
          type: 'ready',
          subscriptionId: this.subscriptionId,
          device: this.device,
          videoCodec: codec
        })
        sender.start()
        if (this.latestFrame && this.latestFrame !== firstJpeg) {
          encoder.feedJpeg(this.latestFrame)
        }
        const activeEncoder = encoder
        this.poll = setInterval(
          () => this.pollEncoder(codec, activeEncoder, sender),
          Math.floor(1000 / this.profile.fps)
        )
        return
      } catch (error) {
        if (encoder) {
          encoder.close()
          throw error
        }
        if (this.stopped) {
          return
        }
      }
    }
    this.readyJpeg()
    if (this.latestFrame) {
      this.frames.queueIosFrame(this.latestFrame)
    }
  }

  sendTouch(phase: 'down' | 'move' | 'up' | 'cancel', x: number, y: number): void {
    if (this.touchSocket?.readyState !== WebSocket.OPEN) {
      throw new Error('iOS touch control is unavailable')
    }
    this.touchSocket.send(
      Buffer.from(
        encodeServeSimTouchFrame({
          type: phase === 'down' ? 'begin' : phase === 'move' ? 'move' : 'end',
          x,
          y
        })
      )
    )
  }

  stop(): void {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.stream?.stop()
    this.firstReject?.(new Error('Simulator stream stopped'))
    this.firstResolve = null
    this.firstReject = null
    this.encoder?.close()
    this.encodedSender?.stop()
    this.frames.stop()
    if (this.poll) {
      clearInterval(this.poll)
    }
    if (this.touchSocket) {
      try {
        if (this.touchSocket.readyState === WebSocket.CONNECTING) {
          this.touchSocket.terminate()
        } else {
          this.touchSocket.close()
        }
      } catch {
        // The connection may have failed during cleanup.
      }
    }
  }

  private onFrame(frame: Buffer): void {
    this.latestFrame = frame
    this.firstResolve?.(frame)
    this.firstResolve = null
    this.firstReject = null
    if (this.encoder) {
      this.encoder.feedJpeg(frame)
    } else if (this.ready) {
      this.frames.queueIosFrame(frame)
    }
  }

  private readyJpeg(): void {
    this.emit({
      type: 'ready',
      subscriptionId: this.subscriptionId,
      device: this.device,
      videoCodec: 'jpeg'
    })
    this.ready = true
  }

  private pollEncoder(
    codec: Exclude<MobileEmulatorVideoCodec, 'jpeg'>,
    encoder: MobileEmulatorVideoEncoder,
    sender: MobileEmulatorEncodedSender
  ): void {
    if (this.pollBusy) {
      return
    }
    this.pollBusy = true
    void encoder
      .takeFrames()
      .then((frames) => {
        if (this.stopped) {
          return
        }
        for (const frame of frames) {
          sender.push({ ...frame, codec })
        }
      })
      .catch((error: unknown) => this.fail(error))
      .finally(() => {
        this.pollBusy = false
      })
  }
}
