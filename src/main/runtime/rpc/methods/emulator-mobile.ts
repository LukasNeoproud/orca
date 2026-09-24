import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { getMobileEmulatorStreamHost } from '../../../host/mobile-emulator-stream-host'

const Coordinate = z.number().finite().min(0).max(1)
const SubscriptionId = z.string().min(1)
const Touch = z.object({
  type: z.literal('touch'),
  phase: z.enum(['down', 'move', 'up', 'cancel']),
  x: Coordinate,
  y: Coordinate,
  videoWidth: z.number().int().min(1).max(16_384).optional(),
  videoHeight: z.number().int().min(1).max(16_384).optional()
})
const GesturePoint = z.object({
  type: z.enum(['begin', 'move', 'end']),
  x: Coordinate,
  y: Coordinate,
  edge: z.number().int().min(0).max(4).optional()
})
const Action = z.discriminatedUnion('type', [
  Touch,
  z.object({ type: z.literal('tap'), x: Coordinate, y: Coordinate }),
  z.object({ type: z.literal('gesture'), points: z.array(GesturePoint).min(2).max(64) }),
  z.object({ type: z.literal('type'), text: z.string().max(10_000) }),
  z.object({ type: z.literal('button'), name: z.string().min(1).max(64) })
])

export const EMULATOR_MOBILE_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'emulator.mobile.devices',
    params: z.object({}),
    handler: async (_params, { runtime }) => {
      if (!runtime.getStatus().capabilities?.includes('emulator.mobile-stream.v1')) {
        throw new Error('Mobile emulator streaming is unavailable on this host')
      }
      const host = getMobileEmulatorStreamHost()
      if (!host) {
        throw new Error('Mobile emulator streaming is unavailable on this host')
      }
      return { devices: host.devices(await runtime.emulatorListDevices({})) }
    }
  }),
  defineStreamingMethod({
    name: 'emulator.mobile.stream',
    params: z.object({
      deviceId: z.string().min(1),
      profile: z.enum(['quality', 'responsive', 'data-saver']).default('responsive'),
      videoCodecs: z
        .array(z.enum(['h264', 'hevc', 'av1', 'jpeg']))
        .min(1)
        .max(4)
        .optional()
    }),
    handler: async (params, { runtime, connectionId, sendBinary, signal }, emit) => {
      if (!connectionId || !sendBinary) {
        throw new Error('Emulator streaming requires an authenticated binary connection')
      }
      if (!runtime.getStatus().capabilities?.includes('emulator.mobile-stream.v1')) {
        throw new Error('Mobile emulator streaming is unavailable on this host')
      }
      const host = getMobileEmulatorStreamHost()
      if (!host) {
        throw new Error('Mobile emulator streaming is unavailable on this host')
      }
      const device = host
        .devices(await runtime.emulatorListDevices({}))
        .find((candidate) => candidate.id === params.deviceId)
      if (!device?.isAvailable) {
        throw new Error('Selected emulator device is unavailable')
      }
      const bridge = runtime.getEmulatorBridge()
      if (!bridge) {
        throw new Error('Emulator backend is unavailable on this host')
      }
      await host.start({
        bridge,
        device,
        profile: params.profile,
        videoCodecs: params.videoCodecs ?? ['jpeg'],
        connectionId,
        sendBinary,
        signal,
        emit,
        registerCleanup: (id, cleanup, owner) =>
          runtime.registerSubscriptionCleanup(id, cleanup, owner),
        removeCleanup: (id) => runtime.cleanupSubscription(id)
      })
    }
  }),
  defineMethod({
    name: 'emulator.mobile.unsubscribe',
    params: z.object({ subscriptionId: SubscriptionId }),
    handler: async (params, { connectionId }) => {
      const host = getMobileEmulatorStreamHost()
      return {
        unsubscribed: connectionId
          ? (host?.stop(params.subscriptionId, connectionId) ?? false)
          : false
      }
    }
  }),
  defineMethod({
    name: 'emulator.mobile.input',
    params: z.object({ subscriptionId: SubscriptionId, action: Action }),
    handler: async (params, { connectionId }) => {
      if (!connectionId) {
        throw new Error('Emulator input requires an authenticated connection')
      }
      const host = getMobileEmulatorStreamHost()
      if (!host) {
        throw new Error('Mobile emulator streaming is unavailable on this host')
      }
      await host.input(params.subscriptionId, connectionId, params.action)
      return { ok: true }
    }
  })
]
