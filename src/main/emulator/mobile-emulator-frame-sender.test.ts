import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeBrowserScreencastFrame } from '../../shared/browser-screencast-protocol'
import { MobileEmulatorFrameSender } from './mobile-emulator-frame-sender'

const { createFromBuffer } = vi.hoisted(() => ({ createFromBuffer: vi.fn() }))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer } }))

const size = { width: 100, height: 200, deviceWidth: 200, deviceHeight: 400 }
const profile = { width: 640, fps: 5, jpegQuality: 45 }

afterEach(() => vi.useRealTimers())

describe('mobile emulator frame delivery', () => {
  it('scales and recompresses iOS frames to the selected profile budget', () => {
    const toJPEG = vi.fn(() => Buffer.from([0xff, 0xd8, 0xff]))
    const resize = vi.fn(() => ({ getSize: () => ({ width: 600, height: 1200 }), toJPEG }))
    createFromBuffer.mockReturnValue({ getSize: () => ({ width: 1200, height: 2400 }), resize })
    const sent: Uint8Array[] = []
    const sender = new MobileEmulatorFrameSender(
      { width: 600, fps: 5, jpegQuality: 45 },
      (bytes) => {
        sent.push(bytes)
        return true
      }
    )
    sender.queueIosFrame(Buffer.from([0xff, 0xd8, 0xff]))
    expect(resize).toHaveBeenCalledWith({ width: 600 })
    expect(toJPEG).toHaveBeenCalledWith(45)
    expect(decodeBrowserScreencastFrame(sent[0]!)?.metadata).toMatchObject({
      deviceWidth: 1200,
      deviceHeight: 2400,
      imageWidth: 600,
      imageHeight: 1200
    })
  })

  it('keeps a 15 fps intake cadence when JPEG encoding takes time', () => {
    vi.useFakeTimers()
    const toJPEG = vi.fn(() => {
      vi.setSystemTime(Date.now() + 12)
      return Buffer.from([0xff, 0xd8, 0xff])
    })
    createFromBuffer.mockReturnValue({ getSize: () => ({ width: 900, height: 1600 }), toJPEG })
    const send = vi.fn().mockReturnValue(true)
    const sender = new MobileEmulatorFrameSender({ width: 900, fps: 15, jpegQuality: 60 }, send)
    for (let index = 0; index < 15; index++) {
      vi.setSystemTime(1_000 + Math.round((index * 1_000) / 15))
      sender.queueIosFrame(Buffer.from([0xff, 0xd8, 0xff]))
    }
    expect(send).toHaveBeenCalledTimes(15)
    expect(sender.lastFrameAt).toBe(1_933)
  })

  it('keeps the latest image under backpressure and never replays an older pending image', () => {
    vi.useFakeTimers()
    const send = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    const sender = new MobileEmulatorFrameSender(profile, send)
    sender.queueJpeg(Uint8Array.of(1), size)
    sender.queueJpeg(Uint8Array.of(2), size)
    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledTimes(2)
    expect(decodeBrowserScreencastFrame(send.mock.calls[1]![0])?.image).toEqual(Uint8Array.of(2))
  })

  it('stops pending retries and rejects late frames after teardown', () => {
    vi.useFakeTimers()
    const send = vi.fn().mockReturnValue(false)
    const sender = new MobileEmulatorFrameSender(profile, send)
    sender.queueJpeg(Uint8Array.of(1), size)
    sender.stop()
    sender.queueJpeg(Uint8Array.of(2), size)
    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
