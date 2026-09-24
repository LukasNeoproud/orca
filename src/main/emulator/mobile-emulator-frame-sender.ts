import { nativeImage } from 'electron'
import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame
} from '../../shared/browser-screencast-protocol'

type FrameSize = { width: number; height: number; deviceWidth: number; deviceHeight: number }
type FrameProfile = { width: number; fps: number; jpegQuality: number }

export class MobileEmulatorFrameSender {
  lastFrameAt = 0
  private nextFrameAt = -Infinity
  private seq = 0
  private pendingFrame: Uint8Array | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(
    private readonly profile: FrameProfile,
    private readonly sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  ) {}

  queueIosFrame(frame: Buffer): void {
    const now = Date.now()
    if (this.stopped || now + 1 < this.nextFrameAt) {
      return
    }
    const original = nativeImage.createFromBuffer(frame)
    const size = original.getSize()
    if (!size.width || !size.height) {
      return
    }
    const scale = Math.min(1, this.profile.width / size.width)
    const image = scale < 1 ? original.resize({ width: Math.round(size.width * scale) }) : original
    const outputSize = image.getSize()
    const interval = 1000 / this.profile.fps
    this.nextFrameAt = Number.isFinite(this.nextFrameAt)
      ? Math.max(this.nextFrameAt + interval, now + interval / 2)
      : now + interval
    this.queueJpeg(image.toJPEG(this.profile.jpegQuality), {
      width: outputSize.width,
      height: outputSize.height,
      deviceWidth: size.width,
      deviceHeight: size.height
    })
    this.lastFrameAt = now
  }

  queueJpeg(image: Uint8Array, size: FrameSize): void {
    if (this.stopped) {
      return
    }
    this.lastFrameAt = Date.now()
    const bytes = encodeBrowserScreencastFrame({
      opcode: BrowserScreencastOpcode.Frame,
      seq: this.seq++,
      format: 'jpeg',
      metadata: {
        deviceWidth: size.deviceWidth,
        deviceHeight: size.deviceHeight,
        imageWidth: size.width,
        imageHeight: size.height,
        timestamp: Date.now()
      },
      image
    })
    if (this.sendBinary(bytes) === false) {
      this.pendingFrame = bytes
      if (!this.retry) {
        this.retry = setTimeout(() => this.flushPending(), 50)
      }
    } else {
      this.pendingFrame = null
      if (this.retry) {
        clearTimeout(this.retry)
      }
      this.retry = null
    }
  }

  stop(): void {
    this.stopped = true
    this.pendingFrame = null
    if (this.retry) {
      clearTimeout(this.retry)
      this.retry = null
    }
  }

  private flushPending(): void {
    this.retry = null
    if (this.stopped || !this.pendingFrame) {
      return
    }
    const bytes = this.pendingFrame
    this.pendingFrame = null
    if (this.sendBinary(bytes) === false) {
      this.pendingFrame = bytes
      this.retry = setTimeout(() => this.flushPending(), 50)
    }
  }
}
