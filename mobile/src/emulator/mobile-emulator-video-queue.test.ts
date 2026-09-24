import { describe, expect, it, vi } from 'vitest'
import { MobileEmulatorVideoQueue } from './mobile-emulator-video-queue'
import type { EmulatorVideoFrame } from '../../../src/shared/emulator-video-protocol'

const frame = (seq: number, config = false, keyFrame = false): EmulatorVideoFrame => ({
  codec: 'hevc',
  subscriptionId: 's',
  seq,
  config,
  keyFrame,
  width: 64,
  height: 48,
  timestampUs: seq,
  data: new Uint8Array([seq])
})
describe('native video submission queue', () => {
  it('preserves config and waits for keyframes after overload instead of decoding orphaned deltas', async () => {
    let unblock!: () => void
    const sent: number[] = []
    const send = vi.fn(async (value: EmulatorVideoFrame) => {
      sent.push(value.seq)
      if (sent.length === 1) {
        await new Promise<void>((resolve) => {
          unblock = resolve
        })
      }
    })
    const queue = new MobileEmulatorVideoQueue(send, vi.fn())
    queue.enqueue(frame(0, true))
    queue.enqueue(frame(1, false, true))
    for (let seq = 2; seq < 70; seq++) {
      queue.enqueue(frame(seq))
    }
    queue.enqueue(frame(70, false, true))
    queue.enqueue(frame(71))
    unblock()
    await vi.waitFor(() => expect(sent).toEqual([0, 0, 70, 71]))
  })
  it('disposes pending work and ignores errors from an old session', async () => {
    let reject!: (cause: Error) => void
    const error = vi.fn()
    const send = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        })
    )
    const queue = new MobileEmulatorVideoQueue(send, error)
    queue.enqueue(frame(1, false, true))
    queue.enqueue(frame(2))
    queue.dispose()
    reject(new Error('old session'))
    await Promise.resolve()
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })
})
