import { describe, expect, it, vi } from 'vitest'
import { MobileEmulatorInputQueue } from './mobile-emulator-input-queue'
import { mapEmulatorTouch } from './mobile-emulator-touch'
import type { MobileEmulatorInput } from './mobile-emulator-types'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const touch = (phase: 'down' | 'move' | 'up', x = 0.5): MobileEmulatorInput => ({
  type: 'touch',
  phase,
  x,
  y: 0.5
})

describe('mobile emulator input', () => {
  it('preserves touch edges and coalesces unsent moves under latency', async () => {
    const pending = deferred()
    const send = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(undefined)
    const queue = new MobileEmulatorInputQueue(send, vi.fn())
    queue.enqueue(touch('down'))
    queue.enqueue(touch('move', 0.2))
    queue.enqueue(touch('move', 0.8))
    queue.enqueue(touch('up', 0.9))
    expect(send).toHaveBeenCalledTimes(1)
    pending.resolve()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    expect(send.mock.calls.map(([action]) => action)).toEqual([
      touch('down'),
      touch('move', 0.8),
      touch('up', 0.9)
    ])
  })
  it('drops all pending input on disconnect and never replays after an in-flight request resolves', async () => {
    const pending = deferred()
    const send = vi.fn(() => pending.promise)
    const queue = new MobileEmulatorInputQueue(send, vi.fn())
    queue.enqueue(touch('down'))
    queue.enqueue(touch('up'))
    queue.dispose()
    pending.resolve()
    await pending.promise
    queue.enqueue({ type: 'button', name: 'home' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('halts the queue when a command fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('disconnected'))
    const onError = vi.fn()
    const queue = new MobileEmulatorInputQueue(send, onError)
    queue.enqueue(touch('down'))
    queue.enqueue(touch('up'))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(send).toHaveBeenCalledOnce()
  })
  it('maps only the image, excluding letterboxing, and clamps an ending drag', () => {
    const layout = { width: 800, height: 400 }
    const image = { width: 400, height: 800 }
    expect(mapEmulatorTouch({ x: 400, y: 200 }, layout, image)).toEqual({ x: 0.5, y: 0.5 })
    expect(mapEmulatorTouch({ x: 100, y: 200 }, layout, image)).toBeNull()
    expect(mapEmulatorTouch({ x: 100, y: 500 }, layout, image, true)).toEqual({ x: 0, y: 1 })
    expect(mapEmulatorTouch({ x: Number.NaN, y: 0 }, layout, image)).toBeNull()
  })
})
