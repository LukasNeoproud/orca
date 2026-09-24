import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { EMULATOR_MOBILE_METHODS } from './emulator-mobile'
import { setMobileEmulatorStreamHost } from '../../../host/mobile-emulator-stream-host'

const backend = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  input: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockReturnValue(true)
}))

function createDispatcher(capabilities = ['emulator.mobile-stream.v1']) {
  const bridge = {}
  const runtime = {
    getRuntimeId: () => 'test',
    getStatus: () => ({ capabilities }),
    getEmulatorBridge: () => bridge,
    emulatorListDevices: vi
      .fn()
      .mockResolvedValue([
        { id: 'existing', backend: 'android', name: 'Pixel', isAvailable: true }
      ]),
    registerSubscriptionCleanup: vi.fn(),
    cleanupSubscription: vi.fn()
  } as unknown as OrcaRuntimeService
  return { runtime, dispatcher: new RpcDispatcher({ runtime, methods: EMULATOR_MOBILE_METHODS }) }
}
const request = (method: string, params: unknown = {}) => ({
  id: 'test-req',
  authToken: 'test',
  method,
  params
})
beforeEach(() => {
  vi.clearAllMocks()
  setMobileEmulatorStreamHost({ ...backend, devices: (devices) => devices })
})
afterEach(() => setMobileEmulatorStreamHost(null))
describe('mobile emulator RPC boundary', () => {
  it('refuses unavailable hosts before importing or probing emulators', async () => {
    const { runtime, dispatcher } = createDispatcher([])
    const response = await dispatcher.dispatch(request('emulator.mobile.devices'))
    expect(response.ok).toBe(false)
    expect(runtime.emulatorListDevices).not.toHaveBeenCalled()
  })
  it('rejects nonexistent devices without starting a helper', async () => {
    const { dispatcher } = createDispatcher()
    const replies: string[] = []
    await dispatcher.dispatchStreaming(
      request('emulator.mobile.stream', { deviceId: 'invented' }),
      (reply) => replies.push(reply),
      { connectionId: 'owner', sendBinary: vi.fn() }
    )
    expect(JSON.parse(replies[0]!)).toMatchObject({ ok: false })
    expect(backend.start).not.toHaveBeenCalled()
  })
  it('requires a binary connection and forwards only trusted connection identity', async () => {
    const { dispatcher } = createDispatcher()
    const replies: string[] = []
    await dispatcher.dispatchStreaming(
      request('emulator.mobile.stream', { deviceId: 'existing' }),
      (reply) => replies.push(reply),
      { connectionId: 'owner' }
    )
    expect(JSON.parse(replies[0]!)).toMatchObject({ ok: false })
    expect(backend.start).not.toHaveBeenCalled()
    await dispatcher.dispatchStreaming(
      request('emulator.mobile.stream', {
        deviceId: 'existing',
        connectionId: 'spoofed',
        profile: 'data-saver'
      }),
      () => {},
      { connectionId: 'owner', sendBinary: vi.fn() }
    )
    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'owner',
        profile: 'data-saver',
        device: expect.objectContaining({ id: 'existing' })
      })
    )
  })
  it('binds touch input to the authenticated connection, not the payload', async () => {
    const { dispatcher } = createDispatcher()
    const action = { type: 'touch', phase: 'down', x: 0.2, y: 0.6 }
    await dispatcher.dispatchStreaming(
      request('emulator.mobile.input', {
        subscriptionId: 'stream',
        connectionId: 'victim',
        action
      }),
      () => {},
      { connectionId: 'caller' }
    )
    expect(backend.input).toHaveBeenCalledWith('stream', 'caller', action)
  })
  it.each([
    { type: 'touch', phase: 'down', x: -1, y: 0.5 },
    { type: 'touch', phase: 'unknown', x: 0, y: 0 },
    { type: 'type', text: 'a'.repeat(10001) },
    { type: 'exec', command: 'anything' }
  ])('rejects invalid control actions: $type', async (action) => {
    const { dispatcher } = createDispatcher()
    const response = await dispatcher.dispatch(
      request('emulator.mobile.input', { subscriptionId: 'stream', action })
    )
    expect(response.ok).toBe(false)
    expect(backend.input).not.toHaveBeenCalled()
  })
})
