import {
  EmulatorMobileDevicesParams,
  EmulatorMobileInputParams,
  EmulatorMobileStreamParams,
  EmulatorMobileUnsubscribeParams
} from '../../../../shared/rpc-contract/emulator-mobile-params'
import { defineMethod, defineStreamingMethod } from '../core'
import { getMobileEmulatorStreamHost } from '../../../host/mobile-emulator-stream-host'

export const EMULATOR_MOBILE_METHODS = [
  defineMethod({
    name: 'emulator.mobile.devices',
    permission: 'workspace',
    params: EmulatorMobileDevicesParams,
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
    permission: 'workspace',
    params: EmulatorMobileStreamParams,
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
    permission: 'workspace',
    params: EmulatorMobileUnsubscribeParams,
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
    permission: 'workspace',
    params: EmulatorMobileInputParams,
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
