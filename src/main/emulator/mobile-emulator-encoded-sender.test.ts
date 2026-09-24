import { describe, expect, it, vi } from 'vitest'
import { decodeEmulatorVideoFrame } from '../../shared/emulator-video-protocol'
import { MobileEmulatorEncodedSender } from './mobile-emulator-encoded-sender'

const frame = (keyFrame: boolean, byte: number) => ({
  codec: 'h264' as const,
  config: false,
  keyFrame,
  width: 640,
  height: 480,
  timestampUs: byte,
  data: Uint8Array.of(byte)
})

describe('mobile encoded video sender', () => {
  it('waits for ready and a keyframe, preserving config and dependent frames', () => {
    const sent: Uint8Array[] = []
    const sender = new MobileEmulatorEncodedSender('subscription', (bytes) => {
      sent.push(bytes)
      return true
    })
    sender.push({ ...frame(false, 1), config: true })
    sender.push(frame(false, 2))
    sender.push(frame(true, 3))
    sender.push(frame(false, 4))
    expect(sent).toEqual([])
    sender.start()
    expect(sent.map((bytes) => decodeEmulatorVideoFrame(bytes)?.data[0])).toEqual([1, 3, 4])
    expect(sent.map((bytes) => decodeEmulatorVideoFrame(bytes)?.seq)).toEqual([0, 1, 2])
  })

  it('retries ordered frames after backpressure and drops an obsolete GOP at the next key', () => {
    vi.useFakeTimers()
    try {
      let blocked = true
      const sent: number[] = []
      const sender = new MobileEmulatorEncodedSender('subscription', (bytes) => {
        if (blocked) {
          return false
        }
        sent.push(decodeEmulatorVideoFrame(bytes)!.data[0])
        return true
      })
      sender.start()
      sender.push({ ...frame(false, 1), config: true })
      sender.push(frame(true, 2))
      sender.push(frame(false, 3))
      sender.push(frame(true, 4))
      blocked = false
      vi.advanceTimersByTime(50)
      expect(sent).toEqual([1, 4])
      sender.stop()
      vi.advanceTimersByTime(100)
      expect(sent).toEqual([1, 4])
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for a new keyframe after the pending GOP exceeds its frame budget', () => {
    const sent: number[] = []
    let blocked = true
    const sender = new MobileEmulatorEncodedSender('subscription', (bytes) => {
      if (blocked) {
        return false
      }
      sent.push(decodeEmulatorVideoFrame(bytes)!.data[0])
      return true
    })
    sender.start()
    sender.push(frame(true, 1))
    for (let index = 0; index < 121; index += 1) {
      sender.push(frame(false, 2))
    }
    blocked = false
    sender.push(frame(false, 3))
    sender.push(frame(true, 4))
    expect(sent).toEqual([4])
    sender.stop()
  })
})
