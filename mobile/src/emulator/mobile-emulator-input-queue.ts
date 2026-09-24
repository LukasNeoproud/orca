import type { MobileEmulatorInput } from './mobile-emulator-types'

// Keep touch edges ordered while replacing moves that have not reached the host.
export class MobileEmulatorInputQueue {
  private pending: MobileEmulatorInput[] = []
  private sending = false
  private disposed = false

  constructor(
    private readonly send: (action: MobileEmulatorInput) => Promise<void>,
    private readonly onError: (error: unknown) => void
  ) {}

  enqueue(action: MobileEmulatorInput): void {
    if (this.disposed) {
      return
    }
    const last = this.pending.at(-1)
    if (
      action.type === 'touch' &&
      action.phase === 'move' &&
      last?.type === 'touch' &&
      last.phase === 'move'
    ) {
      this.pending[this.pending.length - 1] = action
    } else {
      if (this.pending.length >= 32) {
        this.dispose()
        this.onError(new Error('Emulator input is taking too long. Reconnect to continue.'))
        return
      }
      this.pending.push(action)
    }
    void this.drain()
  }

  dispose(): void {
    this.disposed = true
    this.pending = []
  }

  private async drain(): Promise<void> {
    if (this.sending || this.disposed) {
      return
    }
    this.sending = true
    try {
      while (!this.disposed && this.pending.length) {
        await this.send(this.pending.shift()!)
      }
    } catch (error) {
      if (!this.disposed) {
        this.dispose()
        this.onError(error)
      }
    } finally {
      this.sending = false
    }
  }
}
