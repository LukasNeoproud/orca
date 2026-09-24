import { describe, expect, it } from 'vitest'
import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame
} from '../../../src/shared/browser-screencast-protocol'
import { RpcClientStreamRegistry } from './rpc-client-stream-registry'
import { encodeTerminalStreamFrame, TerminalStreamOpcode } from './terminal-stream-protocol'
import type { ConnectionState, RpcResponse } from './types'

type SentRequest = {
  id: string
  method: string
  params?: unknown
}

function createRegistry(initialState: ConnectionState = 'connected') {
  const sent: SentRequest[] = []
  let state = initialState
  let id = 0
  const registry = new RpcClientStreamRegistry({
    nextId: () => `rpc-${++id}`,
    deviceToken: 'device-token',
    getState: () => state,
    sendEncrypted: (request) => {
      sent.push(request as SentRequest)
      return true
    }
  })
  return {
    registry,
    sent,
    setState(next: ConnectionState) {
      state = next
    }
  }
}

function streamingResponse(id: string, result: unknown): RpcResponse {
  return {
    id,
    ok: true,
    streaming: true,
    result,
    _meta: { runtimeId: 'runtime-1' }
  }
}

function terminalOutput(streamId: number, chunk: string): Uint8Array {
  return encodeTerminalStreamFrame({
    opcode: TerminalStreamOpcode.Output,
    streamId,
    seq: 1,
    payload: new TextEncoder().encode(chunk)
  })
}

function imageFrame(): Uint8Array {
  return encodeBrowserScreencastFrame({
    opcode: BrowserScreencastOpcode.Frame,
    seq: 1,
    format: 'jpeg',
    metadata: {},
    image: new Uint8Array([1, 2, 3])
  })
}

describe('RpcClientStreamRegistry', () => {
  it('replays the latest terminal viewport without retaining stale stream routing', () => {
    const { registry, sent } = createRegistry()
    const events: unknown[] = []
    registry.subscribe(
      'terminal.subscribe',
      { terminal: 'term-1', viewport: { cols: 45, rows: 20 } },
      (event) => events.push(event)
    )
    const first = sent[0]!
    registry.handleResponse(streamingResponse(first.id, { type: 'subscribed', streamId: 7 }))
    registry.handleBinary(terminalOutput(7, 'before'))

    registry.updateTerminalViewport('term-1', { cols: 60, rows: 24 })
    registry.markForReplay()
    registry.replayAfterAuthentication()
    registry.handleBinary(terminalOutput(7, 'stale'))

    expect(sent[1]).toMatchObject({
      id: first.id,
      method: 'terminal.subscribe',
      params: { terminal: 'term-1', viewport: { cols: 60, rows: 24 } }
    })
    expect(events).toEqual([
      { type: 'subscribed', streamId: 7 },
      { type: 'data', streamId: 7, chunk: 'before' }
    ])
  })

  it('keeps a disposed browser tombstone until ready can be unsubscribed', () => {
    const { registry, sent } = createRegistry()
    const dispose = registry.subscribe('browser.screencast', { page: 'page-1' }, () => {})
    const request = sent[0]!

    dispose()
    expect(sent).toHaveLength(1)

    registry.handleResponse(
      streamingResponse(request.id, {
        type: 'ready',
        subscriptionId: 'browser-screencast:page-1:test'
      })
    )
    expect(sent[1]).toMatchObject({
      method: 'browser.screencast.unsubscribe',
      params: { subscriptionId: 'browser-screencast:page-1:test' }
    })
  })

  it('cancels emulator startup before ready without routing frames', () => {
    const { registry, sent } = createRegistry()
    const frames: unknown[] = []
    const dispose = registry.subscribe('emulator.mobile.stream', { deviceId: 'slow' }, () => {}, {
      onBinaryFrame: (frame) => frames.push(frame)
    })
    const request = sent[0]!
    registry.handleResponse(
      streamingResponse(request.id, {
        type: 'starting',
        subscriptionId: 'emulator-starting'
      })
    )
    registry.handleBinary(imageFrame())
    expect(frames).toHaveLength(0)
    dispose()
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: 'emulator.mobile.unsubscribe',
        params: { subscriptionId: 'emulator-starting' }
      })
    )
  })

  it('unsubscribes a late emulator starting response after disposal', () => {
    const { registry, sent } = createRegistry()
    const dispose = registry.subscribe('emulator.mobile.stream', {}, () => {})
    const request = sent[0]!
    dispose()
    registry.handleResponse(
      streamingResponse(request.id, {
        type: 'starting',
        subscriptionId: 'emulator-late'
      })
    )
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: 'emulator.mobile.unsubscribe',
        params: { subscriptionId: 'emulator-late' }
      })
    )
  })

  it('replaces a browser image stream with an emulator stream and routes only after ready', () => {
    const { registry, sent } = createRegistry()
    const browserFrames: unknown[] = []
    const emulatorFrames: unknown[] = []
    registry.subscribe('browser.screencast', { page: 'page-1' }, () => {}, {
      onBinaryFrame: (frame) => browserFrames.push(frame)
    })
    registry.handleResponse(
      streamingResponse('rpc-1', { type: 'ready', subscriptionId: 'browser-1' })
    )
    registry.handleBinary(imageFrame())

    const dispose = registry.subscribe(
      'emulator.mobile.stream',
      { deviceId: 'device-1' },
      () => {},
      {
        onBinaryFrame: (frame) => emulatorFrames.push(frame)
      }
    )
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: 'browser.screencast.unsubscribe',
        params: { subscriptionId: 'browser-1' }
      })
    )
    registry.handleBinary(imageFrame())
    expect(browserFrames).toHaveLength(1)
    expect(emulatorFrames).toHaveLength(0)

    const emulatorRequest = sent.find((request) => request.method === 'emulator.mobile.stream')!
    registry.handleResponse(
      streamingResponse(emulatorRequest.id, {
        type: 'ready',
        subscriptionId: 'emulator-1',
        device: { id: 'device-1', name: 'Pixel', backend: 'android' }
      })
    )
    registry.handleBinary(imageFrame())
    expect(emulatorFrames).toHaveLength(1)
    dispose()
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: 'emulator.mobile.unsubscribe',
        params: { subscriptionId: 'emulator-1' }
      })
    )
  })

  it('cleans a late emulator ready after replacement and replays only the latest image stream', () => {
    const { registry, sent, setState } = createRegistry()
    const oldFrames: unknown[] = []
    const newFrames: unknown[] = []
    registry.subscribe('emulator.mobile.stream', { deviceId: 'old' }, () => {}, {
      onBinaryFrame: (frame) => oldFrames.push(frame)
    })
    const oldRequest = sent[0]!
    registry.subscribe('emulator.mobile.stream', { deviceId: 'new' }, () => {}, {
      onBinaryFrame: (frame) => newFrames.push(frame)
    })
    const newRequest = sent[1]!
    registry.handleResponse(
      streamingResponse(oldRequest.id, {
        type: 'ready',
        subscriptionId: 'old-server'
      })
    )
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: 'emulator.mobile.unsubscribe',
        params: { subscriptionId: 'old-server' }
      })
    )
    registry.handleBinary(imageFrame())
    expect(oldFrames).toHaveLength(0)
    expect(newFrames).toHaveLength(0)

    registry.handleResponse(
      streamingResponse(newRequest.id, {
        type: 'ready',
        subscriptionId: 'new-server'
      })
    )
    registry.handleBinary(imageFrame())
    expect(newFrames).toHaveLength(1)
    registry.markForReplay()
    registry.handleBinary(imageFrame())
    expect(newFrames).toHaveLength(1)
    setState('connected')
    registry.replayAfterAuthentication()
    expect(sent.at(-1)).toMatchObject({ id: newRequest.id, method: 'emulator.mobile.stream' })
    registry.handleResponse(
      streamingResponse(newRequest.id, {
        type: 'ready',
        subscriptionId: 'replayed-server'
      })
    )
    registry.handleBinary(imageFrame())
    expect(newFrames).toHaveLength(2)
  })
})
