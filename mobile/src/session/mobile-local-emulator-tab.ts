import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'

export type MobileLocalEmulatorTab = {
  type: 'emulator'
  id: string
  title: string
  scopeKey: string
  device: MobileEmulatorDevice
}

const MOBILE_EMULATOR_TAB_ID_PREFIX = 'mobile-emulator:'

export function mobileEmulatorTabId(device: MobileEmulatorDevice): string {
  return `${MOBILE_EMULATOR_TAB_ID_PREFIX}${device.backend}:${device.id}`
}

/** Phone-owned emulator tabs never appear in host snapshots. */
export function isMobileEmulatorTabId(tabId: string | null | undefined): boolean {
  return Boolean(tabId?.startsWith(MOBILE_EMULATOR_TAB_ID_PREFIX))
}

// Why a shared empty list: older call sites build scopes without the phone-owned tabs.
export const NO_LOCAL_EMULATOR_TABS: readonly MobileLocalEmulatorTab[] = []
