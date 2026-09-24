import type { EmulatorVideoFrame } from '../../../src/shared/emulator-video-protocol'

// Inter frames depend on earlier frames; after overload resume only at a keyframe.
export class MobileEmulatorVideoQueue {
  private pending: EmulatorVideoFrame[] = []
  private bytes = 0
  private running = false
  private disposed = false
  private waitingForKey = true
  private config: EmulatorVideoFrame | null = null

  constructor(
    private readonly send: (frame: EmulatorVideoFrame) => Promise<unknown>,
    private readonly onError: (error: unknown) => void
  ) {}

  enqueue(frame: EmulatorVideoFrame): void {
    if (this.disposed) {
      return
    }
    if (frame.config) {
      this.config = frame
    }
    if (this.pending.length >= 60 || this.bytes + frame.data.byteLength > 8 * 1024 * 1024) {
      this.pending = []
      this.bytes = 0
      this.waitingForKey = true
    }
    if (this.waitingForKey) {
      if (!frame.keyFrame) {
        return
      }
      if (this.config) {
        this.append(this.config)
      }
      this.waitingForKey = false
    }
    this.append(frame)
    void this.drain()
  }

  dispose(): void {
    this.disposed = true
    this.pending = []
    this.config = null
    this.bytes = 0
  }

  private append(frame: EmulatorVideoFrame): void {
    this.pending.push(frame)
    this.bytes += frame.data.byteLength
  }

  private async drain(): Promise<void> {
    if (this.running || this.disposed) {
      return
    }
    this.running = true
    try {
      while (!this.disposed && this.pending.length) {
        const frame = this.pending.shift()!
        this.bytes -= frame.data.byteLength
        await this.send(frame)
      }
    } catch (error) {
      if (!this.disposed) {
        this.dispose()
        this.onError(error)
      }
    } finally {
      this.running = false
    }
  }
}
