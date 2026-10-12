import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobileEmulatorStream } from './use-mobile-emulator-stream'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { getMobileEmulatorVideoCapabilities } from './mobile-emulator-native-video'
import {
  BrowserScreencastOpcode,
  type BrowserScreencastFrame
} from '../transport/browser-screencast-protocol'

vi.mock('./mobile-emulator-native-video', () => ({
  NativeEmulatorVideoView: 'NativeEmulatorVideoView',
  getMobileEmulatorVideoCapabilities: vi
    .fn()
    .mockResolvedValue({ h264: true, hevc: true, av1: true }),
  submitMobileEmulatorVideoFrame: vi.fn().mockResolvedValue(undefined),
  closeMobileEmulatorVideoStream: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('react-native', () => ({}))
let renderer: ReactTestRenderer | undefined
let current!: ReturnType<typeof useMobileEmulatorStream>
const frame: BrowserScreencastFrame = {
  opcode: BrowserScreencastOpcode.Frame,
  seq: 1,
  format: 'jpeg',
  metadata: { imageWidth: 400, imageHeight: 800 },
  image: new Uint8Array([1, 2])
}
function setup() {
  const subscriptions: {
    params: unknown
    video?: (
      frame: import('../../../src/shared/emulator-video-protocol').EmulatorVideoFrame
    ) => void
    event: (value: unknown) => void
    frame?: (value: BrowserScreencastFrame) => void
    cancel: ReturnType<typeof vi.fn>
  }[] = []
  let stateListener: (state: ConnectionState) => void = () => {}
  const sendRequest = vi.fn().mockResolvedValue({ ok: true, result: { ok: true } })
  const client = {
    getState: () => 'connected',
    sendRequest,
    onStateChange: (listener: typeof stateListener) => {
      stateListener = listener
      return () => {}
    },
    subscribe: (
      _method: string,
      _params: unknown,
      event: (value: unknown) => void,
      options?: Parameters<RpcClient['subscribe']>[3]
    ) => {
      const cancel = vi.fn()
      subscriptions.push({
        params: _params,
        event,
        frame: options?.onBinaryFrame,
        video: options?.onEmulatorVideoFrame,
        cancel
      })
      return cancel
    }
  } as unknown as RpcClient
  function Harness({ active = true, visible = true }: { active?: boolean; visible?: boolean }) {
    current = useMobileEmulatorStream(client, 'device', 'responsive', active, 'auto', visible)
    return null
  }
  return {
    client,
    sendRequest,
    subscriptions,
    Harness,
    disconnect: () => stateListener('disconnected' as ConnectionState)
  }
}
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.mocked(getMobileEmulatorVideoCapabilities).mockReset()
  vi.mocked(getMobileEmulatorVideoCapabilities).mockResolvedValue({
    h264: true,
    hevc: true,
    av1: true
  })
  vi.useRealTimers()
})
describe('emulator streaming lifecycle', () => {
  it('ignores a pending start after unmount and starts a fresh stream on remount', async () => {
    let resolveCapabilities!: (value: { h264: boolean; hevc: boolean; av1: boolean }) => void
    vi.mocked(getMobileEmulatorVideoCapabilities).mockImplementationOnce(
      () => new Promise((resolve) => (resolveCapabilities = resolve))
    )
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    expect(test.subscriptions).toHaveLength(0)
    await act(async () => renderer!.unmount())
    resolveCapabilities({ h264: true, hevc: true, av1: true })
    await act(async () => {})
    expect(test.subscriptions).toHaveLength(0)

    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    expect(test.subscriptions).toHaveLength(1)
    const sub = test.subscriptions[0]!
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 'fresh' })
      sub.frame?.(frame)
    })
    expect(current.ready).toBe(true)
    await act(async () => renderer!.unmount())
    expect(sub.cancel).toHaveBeenCalledOnce()
  })
  it('requires a frame before enabling controls and stops on backgrounding', async () => {
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    const sub = test.subscriptions[0]!
    act(() => sub.event({ type: 'ready', subscriptionId: 's1' }))
    expect(current.ready).toBe(false)
    act(() => sub.frame?.(frame))
    expect(current.ready).toBe(true)
    await act(async () => {
      current.sendInput({ type: 'button', name: 'home' })
    })
    expect(test.sendRequest).toHaveBeenCalledWith(
      'emulator.mobile.input',
      { subscriptionId: 's1', action: { type: 'button', name: 'home' } },
      expect.objectContaining({ failWhenDisconnected: true })
    )
    act(() => renderer!.update(createElement(test.Harness, { active: false })))
    expect(sub.cancel).toHaveBeenCalledOnce()
    expect(current.ready).toBe(false)
    expect(current.frames.getSnapshot()).toBeNull()
  })
  it('does not accept late frames or ready events after disconnection', async () => {
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    const sub = test.subscriptions[0]!
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 's1' })
      sub.frame?.(frame)
    })
    act(test.disconnect)
    expect(sub.cancel).toHaveBeenCalledOnce()
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 'old' })
      sub.frame?.(frame)
    })
    expect(current.ready).toBe(false)
    expect(current.error).toContain('Connection interrupted')
    act(() => current.sendInput({ type: 'button', name: 'home' }))
    expect(test.sendRequest).not.toHaveBeenCalled()
  })
  it('disarms input during transport migration until a fresh subscription and frame arrive', async () => {
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    const sub = test.subscriptions[0]!
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 'old' })
      sub.frame?.(frame)
    })
    act(() => sub.event({ type: 'reconnecting' }))
    expect(current.ready).toBe(false)
    act(() => current.sendInput({ type: 'button', name: 'home' }))
    expect(test.sendRequest).not.toHaveBeenCalled()
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 'new' })
      sub.frame?.(frame)
    })
    await act(async () => current.sendInput({ type: 'button', name: 'home' }))
    expect(test.sendRequest.mock.calls[0]?.[1]).toEqual({
      subscriptionId: 'new',
      action: { type: 'button', name: 'home' }
    })
  })
  it('keeps an idle screen live with server heartbeats after its first frame', async () => {
    vi.useFakeTimers()
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    const sub = test.subscriptions[0]!
    act(() => {
      sub.event({ type: 'ready', subscriptionId: 's1' })
      sub.frame?.(frame)
    })
    for (let index = 0; index < 5; index++) {
      act(() => {
        vi.advanceTimersByTime(5000)
        sub.event({ type: 'heartbeat', subscriptionId: 's1' })
      })
    }
    expect(current.ready).toBe(true)
    expect(current.error).toBeNull()
  })
  it('keeps an encoded stream starting while hidden and checks rendering on return', async () => {
    vi.useFakeTimers()
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness, { visible: false }))
    })
    const sub = test.subscriptions[0]!
    act(() => sub.event({ type: 'ready', subscriptionId: 'video1', videoCodec: 'hevc' }))
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(current.error).toBeNull()
    expect(sub.cancel).not.toHaveBeenCalled()

    act(() => renderer!.update(createElement(test.Harness, { visible: true })))
    expect(test.subscriptions).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(sub.cancel).toHaveBeenCalledOnce()
    await act(async () => {})
    expect(test.subscriptions).toHaveLength(2)
  })
  it('times out a ready stream with no frames and allows a fresh retry', async () => {
    vi.useFakeTimers()
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    act(() => test.subscriptions[0]!.event({ type: 'ready', subscriptionId: 's1' }))
    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(current.error).toContain('No emulator frames')
    expect(test.subscriptions[0]!.cancel).toHaveBeenCalledOnce()
    await act(async () => current.retry())
    expect(test.subscriptions).toHaveLength(2)
    expect(current.error).toBeNull()
  })
  it('enables video control only after native rendering and ignores old decoder callbacks', async () => {
    const test = setup()
    await act(async () => {
      renderer = create(createElement(test.Harness))
    })
    const sub = test.subscriptions[0]!
    expect(sub.params).toMatchObject({ videoCodecs: ['h264', 'hevc', 'av1', 'jpeg'] })
    act(() => sub.event({ type: 'ready', subscriptionId: 'video1', videoCodec: 'hevc' }))
    await act(async () =>
      sub.video?.({
        codec: 'hevc',
        subscriptionId: 'video1',
        seq: 0,
        config: false,
        keyFrame: true,
        width: 64,
        height: 48,
        timestampUs: 0,
        data: new Uint8Array([1])
      })
    )
    expect(current.ready).toBe(false)
    act(() => current.onVideoRendered('video1', 48, 64))
    expect(current.ready).toBe(true)
    expect(current.frames.getSnapshot()).toMatchObject({
      width: 48,
      height: 64,
      streamId: 'video1'
    })
    await act(async () => current.onVideoError('video1', 'Decoder unavailable'))
    expect(sub.cancel).toHaveBeenCalledOnce()
    expect(test.subscriptions[1]!.params).toMatchObject({ videoCodecs: ['h264', 'av1', 'jpeg'] })
    act(() => current.onVideoRendered('video1', 48, 64))
    expect(current.ready).toBe(false)
  })
})
