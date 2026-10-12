import { createElement, useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'
import type { MobileSessionTab } from './mobile-session-route-types'
import { mobileEmulatorTabId } from './mobile-local-emulator-tab'
import { useMobileSessionEmulatorTabs } from './use-mobile-session-emulator-tabs'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PendingSessionSelection } from './pending-session-selection'

const storage = vi.hoisted(() => new Map<string, string>())
let routeFocused = true
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    })
  }
}))
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    useEffect(() => (routeFocused ? callback() : undefined), [callback, routeFocused])
  }
}))
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Keyboard: { dismiss: () => {} }
}))
vi.mock('../platform/haptics', () => ({ triggerSelection: () => {} }))

const ios: MobileEmulatorDevice = {
  id: 'ios-1',
  name: 'iPhone',
  backend: 'ios',
  state: 'shutdown',
  isAvailable: true
}
const android: MobileEmulatorDevice = {
  id: 'android-1',
  name: 'Pixel',
  backend: 'android',
  state: 'booted',
  isAvailable: true
}

function makeScope(worktreeId = 'worktree-1') {
  const activeSessionTabIdRef = { current: null as string | null }
  const localEmulatorTabsRef = {
    current: [] as ReturnType<typeof useMobileSessionEmulatorTabs>['localEmulatorTabs']
  }
  const setActiveSessionTabId = vi.fn((id: string | null) => {
    activeSessionTabIdRef.current = id
    scope.activeSessionTabId = id
  })
  const switchSessionTab = vi.fn()
  const scope = {
    hostId: 'host-1',
    worktreeId,
    sessionTabs: [{ type: 'browser', id: 'browser-1' }] as MobileSessionTab[],
    localEmulatorTabs: localEmulatorTabsRef.current,
    setLocalEmulatorTabs: vi.fn((tabs) => {
      localEmulatorTabsRef.current = tabs
      scope.localEmulatorTabs = tabs
    }),
    localEmulatorTabsRef,
    activeSessionTabId: null as string | null,
    activeSessionTabIdRef,
    selectedSessionTabIdRef: { current: null },
    pendingSelectionRef: { current: null as PendingSessionSelection | null },
    activeSessionTabTypeRef: { current: null },
    activeHandleRef: { current: null },
    setActiveHandle: vi.fn(),
    setSelectModeActive: vi.fn(),
    setActiveSessionTabId,
    initializedHandlesRef: { current: new Set<string>() },
    unsubscribeTerminal: vi.fn(),
    switchSessionTab
  }
  return { scope, activeSessionTabIdRef, localEmulatorTabsRef, switchSessionTab }
}

describe('mobile-local emulator tabs', () => {
  it('keeps multiple devices local and returns to a host tab after closing the last one', async () => {
    const { scope, activeSessionTabIdRef, localEmulatorTabsRef, switchSessionTab } = makeScope()
    let actions!: ReturnType<typeof useMobileSessionEmulatorTabs>
    function Harness() {
      actions = useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    await act(async () => {
      actions.openEmulatorDevice(ios)
      actions.openEmulatorDevice(android)
    })
    expect(localEmulatorTabsRef.current.map((tab) => tab.device.id)).toEqual(['ios-1', 'android-1'])
    expect(activeSessionTabIdRef.current).toBe('mobile-emulator:android:android-1')
    await act(async () => {
      actions.closeEmulatorTab(localEmulatorTabsRef.current[1]!)
    })
    expect(activeSessionTabIdRef.current).toBe('mobile-emulator:ios:ios-1')
    await act(async () => {
      actions.closeEmulatorTab(localEmulatorTabsRef.current[0]!)
    })
    expect(switchSessionTab).toHaveBeenCalledWith(scope.sessionTabs[0])
    await act(async () => renderer.unmount())
  })

  it('restores an in-progress emulator tab and selection after a route remount', async () => {
    const worktreeId = 'emulator-remount'
    const first = makeScope(worktreeId)
    let actions!: ReturnType<typeof useMobileSessionEmulatorTabs>
    function Harness({ scope }: { scope: ReturnType<typeof makeScope>['scope'] }) {
      actions = useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { scope: first.scope }))
    })
    await act(async () => actions.openEmulatorDevice(ios))
    expect(actions.appActive).toBe(true)
    await act(async () => renderer.unmount())

    const second = makeScope(worktreeId)
    await act(async () => {
      renderer = create(createElement(Harness, { scope: second.scope }))
    })
    expect(second.localEmulatorTabsRef.current.map((tab) => tab.device.id)).toEqual(['ios-1'])
    expect(second.activeSessionTabIdRef.current).toBe('mobile-emulator:ios:ios-1')
    await act(async () => renderer.unmount())
  })

  it('does not restore a closed emulator tab after a route remount', async () => {
    const worktreeId = 'emulator-closed'
    const first = makeScope(worktreeId)
    let actions!: ReturnType<typeof useMobileSessionEmulatorTabs>
    function Harness({ scope }: { scope: ReturnType<typeof makeScope>['scope'] }) {
      actions = useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { scope: first.scope }))
    })
    await act(async () => actions.openEmulatorDevice(android))
    await act(async () => actions.closeEmulatorTab(first.localEmulatorTabsRef.current[0]!))
    await act(async () => renderer.unmount())

    const second = makeScope(worktreeId)
    await act(async () => {
      renderer = create(createElement(Harness, { scope: second.scope }))
    })
    expect(second.localEmulatorTabsRef.current).toEqual([])
    expect(second.activeSessionTabIdRef.current).toBeNull()
    await act(async () => renderer.unmount())
  })

  it('restores tabs from storage after a cold route mount', async () => {
    const worktreeId = 'emulator-cold-restore'
    storage.set(
      `orca:mobile-emulator-tabs:v1:host-1:${worktreeId}`,
      JSON.stringify({
        tabs: [{ device: android }],
        selectedTabId: 'mobile-emulator:android:android-1'
      })
    )
    const { scope, localEmulatorTabsRef, activeSessionTabIdRef } = makeScope(worktreeId)
    function Harness() {
      useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    expect(localEmulatorTabsRef.current.map((tab) => tab.device.id)).toEqual(['android-1'])
    expect(activeSessionTabIdRef.current).toBe('mobile-emulator:android:android-1')
    await act(async () => renderer.unmount())
  })

  it('keeps a newer open device when an older storage read finishes late', async () => {
    const worktreeId = 'emulator-late-read'
    let finishRead!: (value: string) => void
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve))
    )
    const { scope, localEmulatorTabsRef, activeSessionTabIdRef } = makeScope(worktreeId)
    let actions!: ReturnType<typeof useMobileSessionEmulatorTabs>
    function Harness() {
      actions = useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    await act(async () => actions.openEmulatorDevice(android))
    await act(async () => {
      finishRead(
        JSON.stringify({ tabs: [{ device: ios }], selectedTabId: mobileEmulatorTabId(ios) })
      )
    })
    expect(localEmulatorTabsRef.current.map((tab) => tab.device.id)).toEqual(['android-1'])
    expect(activeSessionTabIdRef.current).toBe('mobile-emulator:android:android-1')
    await act(async () => renderer.unmount())
    vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => storage.get(key) ?? null)
  })

  it('does not steal an explicit host-tab selection when stored tabs load late', async () => {
    const worktreeId = 'emulator-host-selection'
    let finishRead!: (value: string) => void
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve))
    )
    const { scope, localEmulatorTabsRef, activeSessionTabIdRef } = makeScope(worktreeId)
    function Harness() {
      useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    scope.pendingSelectionRef.current = { kind: 'tab', tabId: 'browser-1' }
    scope.activeSessionTabId = 'browser-1'
    activeSessionTabIdRef.current = 'browser-1'
    await act(async () => renderer.update(createElement(Harness)))
    scope.pendingSelectionRef.current = null
    await act(async () => {
      finishRead(
        JSON.stringify({ tabs: [{ device: ios }], selectedTabId: mobileEmulatorTabId(ios) })
      )
    })
    expect(localEmulatorTabsRef.current.map((tab) => tab.device.id)).toEqual(['ios-1'])
    expect(activeSessionTabIdRef.current).toBe('browser-1')
    await act(async () => renderer.unmount())
    vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => storage.get(key) ?? null)
  })

  it('pauses streaming while the route is blurred', async () => {
    const { scope } = makeScope('emulator-focus')
    let actions!: ReturnType<typeof useMobileSessionEmulatorTabs>
    function Harness() {
      actions = useMobileSessionEmulatorTabs(scope as never)
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    expect(actions.appActive).toBe(true)
    routeFocused = false
    await act(async () => renderer.update(createElement(Harness)))
    expect(actions.appActive).toBe(false)
    routeFocused = true
    await act(async () => renderer.update(createElement(Harness)))
    expect(actions.appActive).toBe(true)
    await act(async () => renderer.unmount())
  })
})
