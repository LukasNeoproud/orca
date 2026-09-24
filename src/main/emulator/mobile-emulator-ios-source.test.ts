import { describe, expect, it, vi } from 'vitest'
import { decodeEmulatorVideoFrame } from '../../shared/emulator-video-protocol'
import type { EmulatorDevice } from './backends/emulator-backend'
import { MobileEmulatorFrameSender } from './mobile-emulator-frame-sender'
import { MobileEmulatorIosSource } from './mobile-emulator-ios-source'
import { MobileEmulatorVideoEncoder } from './mobile-emulator-video-encoder'

vi.mock('ws', () => ({
  default: class {
    static OPEN = 1
    readyState = 1
    on = vi.fn()
    send = vi.fn()
    close = vi.fn()
  }
}))
vi.mock('./ios-emulator-touch-socket', () => ({ waitForIosTouchSocket: vi.fn(async () => {}) }))
vi.mock('./mjpeg-frame-stream', () => ({
  MjpegFrameStream: class {
    constructor(
      _url: string,
      private readonly callbacks: { onFrame: (frame: Buffer) => void }
    ) {}
    start(): void {
      this.callbacks.onFrame(Buffer.of(1, 2, 3))
    }
    stop(): void {}
  }
}))
vi.mock('./mobile-emulator-video-encoder', () => ({
  MobileEmulatorVideoEncoder: { create: vi.fn() }
}))

const device: EmulatorDevice = {
  backend: 'ios',
  id: 'sim-1',
  name: 'iPhone',
  state: 'booted',
  isAvailable: true
}
const profile = { width: 640, fps: 5, jpegQuality: 45, bitRate: 800_000 }

describe('iOS mobile encoded source', () => {
  it('falls through unsupported encoders and emits ready before encoded bytes', async () => {
    vi.useFakeTimers()
    try {
      const close = vi.fn()
      const takeFrames = vi.fn(async () => [
        {
          config: false,
          keyFrame: true,
          timestampUs: 25,
          width: 64,
          height: 48,
          data: Uint8Array.of(7)
        }
      ])
      vi.mocked(MobileEmulatorVideoEncoder.create).mockImplementation(async (codec) => {
        if (codec === 'av1') {
          throw new Error('AV1 unavailable')
        }
        return { close, feedJpeg: vi.fn(), takeFrames } as unknown as MobileEmulatorVideoEncoder
      })
      const order: string[] = []
      const binary: Uint8Array[] = []
      const source = new MobileEmulatorIosSource(
        'http://localhost/stream.mjpeg',
        'ws://localhost/control',
        'subscription',
        device,
        profile,
        ['av1', 'hevc', 'jpeg'],
        (bytes) => {
          order.push('binary')
          binary.push(bytes)
          return true
        },
        new MobileEmulatorFrameSender(profile, () => true),
        (event) => order.push((event as { type: string }).type),
        (error) => {
          throw error
        }
      )
      await source.start()
      await vi.advanceTimersByTimeAsync(200)
      expect(
        vi.mocked(MobileEmulatorVideoEncoder.create).mock.calls.map((call) => call[0])
      ).toEqual(['av1', 'hevc'])
      expect(order.slice(0, 2)).toEqual(['ready', 'binary'])
      expect(decodeEmulatorVideoFrame(binary[0])).toMatchObject({ codec: 'hevc', keyFrame: true })
      source.stop()
      expect(close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      vi.mocked(MobileEmulatorVideoEncoder.create).mockReset()
    }
  })

  it('keeps the legacy JPEG path when the client offers no video codec', async () => {
    const queueIosFrame = vi.fn()
    const frames = {
      queueIosFrame,
      lastFrameAt: 0,
      stop: vi.fn()
    } as unknown as MobileEmulatorFrameSender
    const events: string[] = []
    const fail = vi.fn()
    const source = new MobileEmulatorIosSource(
      'http://localhost/stream.mjpeg',
      'ws://localhost/control',
      'subscription',
      device,
      profile,
      ['jpeg'],
      () => true,
      frames,
      (event) => events.push((event as { videoCodec: string }).videoCodec),
      fail
    )
    await source.start()
    expect(events).toEqual(['jpeg'])
    expect(queueIosFrame).toHaveBeenCalledOnce()
    const socket = (source as unknown as { touchSocket: { on: ReturnType<typeof vi.fn> } })
      .touchSocket
    const closeListener = socket.on.mock.calls.find(([name]) => name === 'close')?.[1] as () => void
    closeListener()
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'iOS touch control closed' })
    )
    source.stop()
  })
})
