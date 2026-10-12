import { describe, expect, it, vi } from 'vitest'
import {
  encodeEmulatorVideoFrame,
  type EmulatorVideoCodec
} from '../../../src/shared/emulator-video-protocol'
import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame
} from '../../../src/shared/browser-screencast-protocol'
import { RpcClientStreamRegistry } from './rpc-client-stream-registry'
import { MobileRelayRpcStreams } from './mobile-relay-rpc-streams'
import type { RpcResponse } from './types'

function video(id: string, codec: EmulatorVideoCodec = 'h264') {
  return encodeEmulatorVideoFrame({
    codec,
    subscriptionId: id,
    seq: 1,
    config: false,
    keyFrame: true,
    width: 1080,
    height: 1920,
    timestampUs: 123,
    data: new Uint8Array([1, 2, 3])
  })
}

function browserFrame() {
  return encodeBrowserScreencastFrame({
    opcode: BrowserScreencastOpcode.Frame,
    seq: 1,
    format: 'jpeg',
    metadata: {},
    image: new Uint8Array([1])
  })
}

function ready(id: string, subscriptionId: string, videoCodec?: string): RpcResponse {
  return {
    id,
    ok: true,
    streaming: true,
    result: { type: 'ready', subscriptionId, videoCodec },
    _meta: { runtimeId: 'host' }
  }
}

describe('emulator video transport routing', () => {
  it('direct accepts only the active negotiated subscription and fences cancellation', () => {
    let id = 0
    const registry = new RpcClientStreamRegistry({
      nextId: () => `rpc-${++id}`,
      getState: () => 'connected',
      sendFrame: () => true
    })
    const frames = vi.fn()
    const first = registry.subscribe('emulator.mobile.stream', {}, vi.fn(), {
      onEmulatorVideoFrame: frames
    })
    registry.handleBinary(video('first'))
    registry.handleResponse(ready('rpc-1', 'first'))
    registry.handleBinary(video('first'))
    expect(frames).not.toHaveBeenCalled()
    registry.handleResponse(ready('rpc-1', 'first', 'h264'))
    registry.handleBinary(video('first'))
    registry.handleBinary(video('first', 'hevc'))
    expect(frames).toHaveBeenCalledOnce()

    const second = registry.subscribe('emulator.mobile.stream', {}, vi.fn(), {
      onEmulatorVideoFrame: frames
    })
    registry.handleBinary(video('first'))
    registry.handleResponse(ready('rpc-2', 'second', 'h264'))
    registry.handleBinary(video('first'))
    registry.handleBinary(video('second'))
    expect(frames).toHaveBeenCalledTimes(2)
    first()
    second()
    registry.handleBinary(video('second'))
    expect(frames).toHaveBeenCalledTimes(2)
  })

  it('relay accepts only the active negotiated subscription and fences cancellation', async () => {
    let id = 0
    const streams = new MobileRelayRpcStreams({
      nextId: () => `rpc-${++id}`,
      sendFrame: () => true,
      waitForConnected: async () => {}
    })
    const frames = vi.fn()
    streams.subscribe('emulator.mobile.stream', {}, vi.fn(), { onEmulatorVideoFrame: frames })
    await Promise.resolve()
    streams.handleResponse(ready('rpc-1', 'first', 'av1'))
    streams.handleBinary(video('first', 'av1'))
    expect(frames).toHaveBeenCalledOnce()
    streams.handleResponse({
      id: 'rpc-1',
      ok: true,
      streaming: true,
      result: { type: 'heartbeat', subscriptionId: 'first' },
      _meta: { runtimeId: 'host' }
    })
    streams.handleBinary(video('first', 'av1'))
    expect(frames).toHaveBeenCalledTimes(2)
    const second = streams.subscribe('emulator.mobile.stream', {}, vi.fn(), {
      onEmulatorVideoFrame: frames
    })
    await Promise.resolve()
    streams.handleResponse(ready('rpc-2', 'second', 'hevc'))
    streams.handleBinary(video('first', 'av1'))
    streams.handleBinary(video('second', 'h264'))
    streams.handleBinary(video('second', 'hevc'))
    expect(frames).toHaveBeenCalledTimes(3)
    second()
    streams.handleBinary(video('second', 'hevc'))
    expect(frames).toHaveBeenCalledTimes(3)
  })

  it('keeps browser screencast frames on the legacy callback', async () => {
    const direct = new RpcClientStreamRegistry({
      nextId: () => 'direct',
      getState: () => 'connected',
      sendFrame: () => true
    })
    const relay = new MobileRelayRpcStreams({
      nextId: () => 'relay',
      sendFrame: () => true,
      waitForConnected: async () => {}
    })
    const directBrowser = vi.fn()
    const directVideo = vi.fn()
    const relayBrowser = vi.fn()
    const relayVideo = vi.fn()
    direct.subscribe('browser.screencast', {}, vi.fn(), {
      onBinaryFrame: directBrowser,
      onEmulatorVideoFrame: directVideo
    })
    relay.subscribe('browser.screencast', {}, vi.fn(), {
      onBinaryFrame: relayBrowser,
      onEmulatorVideoFrame: relayVideo
    })
    await Promise.resolve()
    direct.handleResponse(ready('direct', 'browser-sub'))
    relay.handleResponse(ready('relay', 'browser-sub'))
    direct.handleBinary(video('browser-sub'))
    relay.handleBinary(video('browser-sub'))
    direct.handleBinary(browserFrame())
    relay.handleBinary(browserFrame())
    expect(directVideo).not.toHaveBeenCalled()
    expect(relayVideo).not.toHaveBeenCalled()
    expect(directBrowser).toHaveBeenCalledOnce()
    expect(relayBrowser).toHaveBeenCalledOnce()
  })
})
