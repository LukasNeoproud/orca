import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'
import type { MobileSessionTab } from './mobile-session-route-types'
import { useMobileSessionEmulatorTabs } from './use-mobile-session-emulator-tabs'

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

function makeScope() {
  const activeSessionTabIdRef = { current: null as string | null }
  const localEmulatorTabsRef = {
    current: [] as ReturnType<typeof useMobileSessionEmulatorTabs>['localEmulatorTabs']
  }
  const setActiveSessionTabId = vi.fn((id: string | null) => {
    activeSessionTabIdRef.current = id
  })
  const switchSessionTab = vi.fn()
  const scope = {
    hostId: 'host-1',
    worktreeId: 'worktree-1',
    sessionTabs: [{ type: 'browser', id: 'browser-1' }] as MobileSessionTab[],
    localEmulatorTabs: localEmulatorTabsRef.current,
    setLocalEmulatorTabs: vi.fn((tabs) => {
      localEmulatorTabsRef.current = tabs
    }),
    localEmulatorTabsRef,
    activeSessionTabId: null,
    activeSessionTabIdRef,
    selectedSessionTabIdRef: { current: null },
    pendingActiveSessionTabIdRef: { current: null },
    pendingActiveTerminalHandleRef: { current: null },
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
})
