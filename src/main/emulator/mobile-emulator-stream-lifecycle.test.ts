import { describe, expect, it, vi } from 'vitest'
import type { EmulatorBridge } from './emulator-bridge'
import {
  sendMobileEmulatorInput,
  startMobileEmulatorStream,
  stopMobileEmulatorStream
} from './mobile-emulator-stream'
import { MobileEmulatorVideoDecoder } from './mobile-emulator-video-decoder'
import { scrcpyVideoRegistry } from './scrcpy-video-registry'
import { decodeEmulatorVideoFrame } from '../../shared/emulator-video-protocol'

describe('mobile emulator connection lifecycle', () => {
  it('negotiates a dedicated Android encoder and echoes the actual codec before binary frames', async () => {
    const close = vi.fn()
    const startMobileAndroidVideoSession = vi.fn(
      async (request: {
        codec: string
        profile: unknown
        callbacks: {
          onMeta: (meta: { codecId: string; width: number; height: number }) => void
          onFrame: (frame: {
            config: boolean
            keyFrame: boolean
            pts: bigint
            data: Buffer
          }) => void
        }
      }) => {
        if (request.codec === 'av1') {
          throw new Error('AV1 encoder unavailable')
        }
        request.callbacks.onMeta({ codecId: 'h265', width: 640, height: 480 })
        request.callbacks.onFrame({ config: false, keyFrame: true, pts: 123n, data: Buffer.of(7) })
        return { close, sendTouch: vi.fn(() => true) }
      }
    )
    const bridge = {
      acquireHelperForDevice: vi.fn(async () => ({
        info: {
          deviceUdid: 'emulator-5554',
          streamUrl: 'scrcpy://emulator-5554',
          wsUrl: '',
          streamCodec: 'h264'
        },
        release: async () => {}
      })),
      registerActiveEmulator: vi.fn(),
      stopActiveForWorktree: vi.fn(async () => null),
      startMobileAndroidVideoSession
    } as unknown as EmulatorBridge
    const events: { type: string; subscriptionId?: string; videoCodec?: string }[] = []
    const frames: Uint8Array[] = []
    const stream = startMobileEmulatorStream({
      bridge,
      device: {
        backend: 'android',
        id: 'emulator-5554',
        name: 'Pixel',
        state: 'booted',
        detail: 'emulator',
        isAvailable: true
      },
      profile: 'data-saver',
      videoCodecs: ['av1', 'hevc', 'jpeg'],
      connectionId: 'owner',
      sendBinary: (bytes) => {
        frames.push(bytes)
        return true
      },
      emit: (event) => events.push(event as (typeof events)[number]),
      registerCleanup: () => {},
      removeCleanup: () => {}
    })
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    expect(events.map((event) => event.type).slice(0, 2)).toEqual(['starting', 'ready'])
    expect(events[1].videoCodec).toBe('hevc')
    expect(startMobileAndroidVideoSession.mock.calls.map((call) => call[0].codec)).toEqual([
      'av1',
      'h265'
    ])
    expect(startMobileAndroidVideoSession.mock.calls[1][0].profile).toMatchObject({
      width: 640,
      fps: 5,
      bitRate: 800_000
    })
    expect(decodeEmulatorVideoFrame(frames[0])).toMatchObject({
      codec: 'hevc',
      width: 640,
      height: 480,
      timestampUs: 123,
      keyFrame: true
    })
    stopMobileEmulatorStream(events[0].subscriptionId!, 'owner')
    await stream
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not boot a device when the signal is already aborted', async () => {
    const bridge = { acquireHelperForDevice: vi.fn() } as unknown as EmulatorBridge
    const controller = new AbortController()
    controller.abort()
    await startMobileEmulatorStream({
      bridge,
      device: {
        backend: 'android',
        id: 'Pixel_8',
        name: 'Pixel 8',
        state: 'shutdown',
        detail: 'avd',
        isAvailable: true
      },
      profile: 'responsive',
      connectionId: 'owner',
      sendBinary: () => true,
      emit: () => {},
      registerCleanup: () => {},
      removeCleanup: () => {},
      signal: controller.signal
    })
    expect(bridge.acquireHelperForDevice).not.toHaveBeenCalled()
  })

  it('closes a decoder that finishes creating after unsubscribe', async () => {
    let resolveDecoder!: (decoder: MobileEmulatorVideoDecoder) => void
    const creating = new Promise<MobileEmulatorVideoDecoder>((resolve) => {
      resolveDecoder = resolve
    })
    const close = vi.fn()
    const create = vi.spyOn(MobileEmulatorVideoDecoder, 'create').mockReturnValue(creating)
    const bridge = {
      acquireHelperForDevice: vi.fn(async () => ({
        info: {
          deviceUdid: 'emulator-5554',
          streamUrl: 'scrcpy://emulator-5554',
          wsUrl: '',
          streamCodec: 'h264'
        },
        release: async () => {}
      })),
      registerActiveEmulator: vi.fn(),
      stopActiveForWorktree: vi.fn(async () => null)
    } as unknown as EmulatorBridge
    let subscriptionId = ''
    const stream = startMobileEmulatorStream({
      bridge,
      device: {
        backend: 'android',
        id: 'emulator-5554',
        name: 'Pixel',
        state: 'booted',
        detail: 'emulator',
        isAvailable: true
      },
      profile: 'responsive',
      connectionId: 'owner',
      sendBinary: () => true,
      emit: (event) => {
        const value = event as { type: string; subscriptionId?: string }
        if (value.type === 'starting') {
          subscriptionId = value.subscriptionId!
        }
      },
      registerCleanup: () => {},
      removeCleanup: () => {}
    })
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(stopMobileEmulatorStream(subscriptionId, 'owner')).toBe(true)
    await stream
    resolveDecoder({ close } as unknown as MobileEmulatorVideoDecoder)
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    create.mockRestore()
  })

  it('cancels a held Android touch when its owning subscription ends', async () => {
    const sendTouch = vi.fn((_phase: string, _x: number, _y: number) => true)
    scrcpyVideoRegistry.register('emulator-5554', () => {}, sendTouch)
    const create = vi.spyOn(MobileEmulatorVideoDecoder, 'create').mockResolvedValue({
      close: vi.fn(),
      feed: vi.fn(),
      takeImage: vi.fn(async () => null)
    } as unknown as MobileEmulatorVideoDecoder)
    const bridge = {
      acquireHelperForDevice: vi.fn(async () => ({
        info: {
          deviceUdid: 'emulator-5554',
          streamUrl: 'scrcpy://emulator-5554',
          wsUrl: '',
          streamCodec: 'h264'
        },
        release: async () => {}
      })),
      registerActiveEmulator: vi.fn(),
      stopActiveForWorktree: vi.fn(async () => null)
    } as unknown as EmulatorBridge
    let subscriptionId = ''
    let ready = false
    const stream = startMobileEmulatorStream({
      bridge,
      device: {
        backend: 'android',
        id: 'emulator-5554',
        name: 'Pixel',
        state: 'booted',
        detail: 'emulator',
        isAvailable: true
      },
      profile: 'responsive',
      connectionId: 'owner',
      sendBinary: () => true,
      emit: (event) => {
        const value = event as { type: string; subscriptionId?: string }
        if (value.type === 'starting') {
          subscriptionId = value.subscriptionId!
        }
        if (value.type === 'ready') {
          ready = true
        }
      },
      registerCleanup: () => {},
      removeCleanup: () => {}
    })
    await vi.waitFor(() => expect(ready).toBe(true))
    await sendMobileEmulatorInput(subscriptionId, 'owner', {
      type: 'touch',
      phase: 'down',
      x: 0.2,
      y: 0.3
    })
    expect(stopMobileEmulatorStream(subscriptionId, 'owner')).toBe(true)
    await stream
    expect(sendTouch.mock.calls.map((call) => call[0])).toEqual(['down', 'cancel'])
    create.mockRestore()
    scrcpyVideoRegistry.stop('emulator-5554')
  })

  it('cancels a boot in progress without powering off the selected device', async () => {
    let completeBoot!: (lease: {
      info: { deviceUdid: string; streamUrl: string; wsUrl: string }
      release: () => Promise<void>
    }) => void
    const boot = new Promise<Parameters<typeof completeBoot>[0]>((resolve) => {
      completeBoot = resolve
    })
    const release = vi.fn(async () => {})
    const registerActiveEmulator = vi.fn()
    const stopActiveForWorktree = vi.fn(async () => null)
    const bridge = {
      acquireHelperForDevice: vi.fn(() => boot),
      registerActiveEmulator,
      stopActiveForWorktree
    } as unknown as EmulatorBridge
    let subscriptionId = ''
    const stream = startMobileEmulatorStream({
      bridge,
      device: {
        backend: 'android',
        id: 'Pixel_8',
        name: 'Pixel 8',
        state: 'shutdown',
        detail: 'avd',
        isAvailable: true
      },
      profile: 'responsive',
      connectionId: 'owner',
      sendBinary: () => true,
      emit: (event) => {
        const value = event as { type: string; subscriptionId?: string }
        if (value.type === 'starting') {
          subscriptionId = value.subscriptionId!
        }
      },
      registerCleanup: () => {},
      removeCleanup: () => {}
    })
    expect(subscriptionId).not.toBe('')
    await expect(
      sendMobileEmulatorInput(subscriptionId, 'other', { type: 'tap', x: 0.5, y: 0.5 })
    ).rejects.toThrow('unavailable on this connection')
    expect(stopMobileEmulatorStream(subscriptionId, 'other')).toBe(false)
    expect(stopMobileEmulatorStream(subscriptionId, 'owner')).toBe(true)
    await stream
    completeBoot({
      info: { deviceUdid: 'emulator-5554', streamUrl: 'scrcpy://emulator-5554', wsUrl: '' },
      release
    })
    await vi.waitFor(() =>
      expect(stopActiveForWorktree).toHaveBeenCalledWith(subscriptionId, { shutdownDevice: false })
    )
    expect(release).toHaveBeenCalledOnce()
    expect(registerActiveEmulator).toHaveBeenCalledOnce()
  })
})
