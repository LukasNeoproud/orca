import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'

export type MobileLocalEmulatorTab = {
  type: 'emulator'
  id: string
  title: string
  scopeKey: string
  device: MobileEmulatorDevice
}

export function mobileEmulatorTabId(device: MobileEmulatorDevice): string {
  return `mobile-emulator:${device.backend}:${device.id}`
}
