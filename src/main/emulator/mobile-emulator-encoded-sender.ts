import {
  encodeEmulatorVideoFrame,
  type EmulatorVideoFrame
} from '../../shared/emulator-video-protocol'

type EncodedFrame = Omit<EmulatorVideoFrame, 'subscriptionId' | 'seq'>

const MAX_PENDING_FRAMES = 120
const MAX_PENDING_BYTES = 8 * 1024 * 1024

export class MobileEmulatorEncodedSender {
  lastFrameAt = 0
  private sequence = 0
  private config: EncodedFrame | null = null
  private pending: EncodedFrame[] = []
  private pendingBytes = 0
  private waitingForKey = true
  private retry: ReturnType<typeof setTimeout> | null = null
  private ready = false
  private stopped = false

  constructor(
    private readonly subscriptionId: string,
    private readonly sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  ) {}

  start(): void {
    if (this.stopped) {
      return
    }
    this.ready = true
    this.flush()
  }

  push(frame: EncodedFrame): void {
    if (this.stopped) {
      return
    }
    if (frame.config) {
      this.config = frame
      return
    }
    if (this.waitingForKey && !frame.keyFrame) {
      return
    }
    if (frame.keyFrame) {
      this.waitingForKey = false
      // A newer keyframe supersedes a stalled GOP without breaking dependencies.
      this.pending = []
      this.pendingBytes = 0
      if (this.config) {
        this.enqueue(this.config)
      }
    }
    this.enqueue(frame)
    if (this.pending.length > MAX_PENDING_FRAMES || this.pendingBytes > MAX_PENDING_BYTES) {
      this.pending = []
      this.pendingBytes = 0
      this.waitingForKey = true
      return
    }
    this.flush()
  }

  stop(): void {
    this.stopped = true
    this.pending = []
    this.pendingBytes = 0
    if (this.retry) {
      clearTimeout(this.retry)
    }
    this.retry = null
  }

  private enqueue(frame: EncodedFrame): void {
    this.pending.push(frame)
    this.pendingBytes += frame.data.byteLength
  }

  private flush(): void {
    if (!this.ready || this.stopped) {
      return
    }
    if (this.retry) {
      clearTimeout(this.retry)
      this.retry = null
    }
    while (this.pending.length > 0) {
      const frame = this.pending[0]
      const bytes = encodeEmulatorVideoFrame({
        ...frame,
        subscriptionId: this.subscriptionId,
        seq: this.sequence
      })
      if (this.sendBinary(bytes) === false) {
        this.retry = setTimeout(() => this.flush(), 50)
        return
      }
      this.sequence = (this.sequence + 1) >>> 0
      this.pending.shift()
      this.pendingBytes -= frame.data.byteLength
      this.lastFrameAt = Date.now()
    }
  }
}
