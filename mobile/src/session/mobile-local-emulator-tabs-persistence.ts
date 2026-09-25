import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'
import { mobileEmulatorTabId, type MobileLocalEmulatorTab } from './mobile-local-emulator-tab'

export type MobileLocalEmulatorTabsSnapshot = {
  tabs: MobileLocalEmulatorTab[]
  selectedTabId: string | null
}

const STORAGE_PREFIX = 'orca:mobile-emulator-tabs:v1:'
const snapshots = new Map<string, MobileLocalEmulatorTabsSnapshot>()
const writes = new Map<string, Promise<void>>()

function storageKey(hostId: string, worktreeId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(hostId)}:${encodeURIComponent(worktreeId)}`
}

function parseDevice(value: unknown): MobileEmulatorDevice | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const device = value as Partial<MobileEmulatorDevice>
  if (
    typeof device.id !== 'string' ||
    !device.id ||
    typeof device.name !== 'string' ||
    (device.backend !== 'ios' && device.backend !== 'android')
  ) {
    return null
  }
  return {
    id: device.id,
    name: device.name,
    backend: device.backend,
    state: device.state === 'booted' || device.state === 'booting' ? device.state : 'shutdown',
    isAvailable: device.isAvailable === true,
    ...(typeof device.detail === 'string' ? { detail: device.detail } : {})
  }
}

function parseSnapshot(raw: string | null, scopeKey: string): MobileLocalEmulatorTabsSnapshot {
  if (!raw) {
    return { tabs: [], selectedTabId: null }
  }
  try {
    const value = JSON.parse(raw) as { tabs?: unknown; selectedTabId?: unknown }
    if (!Array.isArray(value.tabs)) {
      return { tabs: [], selectedTabId: null }
    }
    const seen = new Set<string>()
    const tabs = value.tabs.flatMap((entry): MobileLocalEmulatorTab[] => {
      const device = parseDevice((entry as { device?: unknown } | null)?.device)
      if (!device) {
        return []
      }
      const id = mobileEmulatorTabId(device)
      if (seen.has(id)) {
        return []
      }
      seen.add(id)
      return [{ type: 'emulator', id, title: device.name, scopeKey, device }]
    })
    return {
      tabs,
      selectedTabId:
        typeof value.selectedTabId === 'string' && seen.has(value.selectedTabId)
          ? value.selectedTabId
          : null
    }
  } catch {
    return { tabs: [], selectedTabId: null }
  }
}

export function cachedMobileLocalEmulatorTabs(
  scopeKey: string
): MobileLocalEmulatorTabsSnapshot | null {
  return snapshots.get(scopeKey) ?? null
}

export async function loadMobileLocalEmulatorTabs(
  hostId: string,
  worktreeId: string,
  scopeKey: string
): Promise<MobileLocalEmulatorTabsSnapshot> {
  const cached = snapshots.get(scopeKey)
  if (cached) {
    return cached
  }
  const key = storageKey(hostId, worktreeId)
  await writes.get(key)
  if (snapshots.has(scopeKey)) {
    return snapshots.get(scopeKey)!
  }
  const snapshot = parseSnapshot(await AsyncStorage.getItem(key), scopeKey)
  if (snapshots.has(scopeKey)) {
    return snapshots.get(scopeKey)!
  }
  snapshots.set(scopeKey, snapshot)
  return snapshot
}

export function saveMobileLocalEmulatorTabs(
  hostId: string,
  worktreeId: string,
  scopeKey: string,
  snapshot: MobileLocalEmulatorTabsSnapshot
): Promise<void> {
  snapshots.set(scopeKey, snapshot)
  const key = storageKey(hostId, worktreeId)
  const write = (writes.get(key) ?? Promise.resolve()).then(() =>
    AsyncStorage.setItem(key, JSON.stringify(snapshot))
  )
  const barrier = write.catch(() => undefined)
  writes.set(key, barrier)
  void barrier.then(() => {
    if (writes.get(key) === barrier) {
      writes.delete(key)
    }
  })
  return write
}
