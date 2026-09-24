import { useCallback, useEffect, useState } from 'react'
import { AppState, Keyboard } from 'react-native'
import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'
import { triggerSelection } from '../platform/haptics'
import { mobileEmulatorTabId, type MobileLocalEmulatorTab } from './mobile-local-emulator-tab'
import type { MobileSessionTabSwitchingModel } from './use-mobile-session-tab-switching'

export function useMobileSessionEmulatorTabs(scope: MobileSessionTabSwitchingModel) {
  const {
    hostId,
    worktreeId,
    sessionTabs,
    localEmulatorTabs,
    setLocalEmulatorTabs,
    localEmulatorTabsRef,
    activeSessionTabId,
    activeSessionTabIdRef,
    selectedSessionTabIdRef,
    pendingActiveSessionTabIdRef,
    pendingActiveTerminalHandleRef,
    activeSessionTabTypeRef,
    activeHandleRef,
    setActiveHandle,
    setSelectModeActive,
    setActiveSessionTabId,
    initializedHandlesRef,
    unsubscribeTerminal,
    switchSessionTab
  } = scope
  const [emulatorActionTarget, setEmulatorActionTarget] = useState<MobileLocalEmulatorTab | null>(
    null
  )
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  const scopeKey = `${hostId}:${worktreeId}`

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active')
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    localEmulatorTabsRef.current = []
    setLocalEmulatorTabs([])
    setEmulatorActionTarget(null)
    if (activeSessionTabIdRef.current?.startsWith('mobile-emulator:')) {
      activeSessionTabIdRef.current = null
      selectedSessionTabIdRef.current = null
      activeSessionTabTypeRef.current = null
      setActiveSessionTabId(null)
    }
  }, [hostId, worktreeId, localEmulatorTabsRef, setLocalEmulatorTabs])

  const switchEmulatorTab = useCallback(
    (tab: MobileLocalEmulatorTab) => {
      triggerSelection()
      Keyboard.dismiss()
      setSelectModeActive(false)
      pendingActiveSessionTabIdRef.current = null
      pendingActiveTerminalHandleRef.current = null
      selectedSessionTabIdRef.current = tab.id
      activeSessionTabTypeRef.current = 'emulator'
      activeSessionTabIdRef.current = tab.id
      setActiveSessionTabId(tab.id)
      const previous = activeHandleRef.current
      if (previous) {
        unsubscribeTerminal(previous)
        initializedHandlesRef.current.delete(previous)
      }
      activeHandleRef.current = null
      setActiveHandle(null)
    },
    [initializedHandlesRef, unsubscribeTerminal]
  )

  const openEmulatorDevice = useCallback(
    (device: MobileEmulatorDevice) => {
      const id = mobileEmulatorTabId(device)
      const existing = localEmulatorTabsRef.current.find(
        (tab) => tab.id === id && tab.scopeKey === scopeKey
      )
      const tab: MobileLocalEmulatorTab = existing ?? {
        type: 'emulator',
        id,
        title: device.name,
        scopeKey,
        device
      }
      if (!existing) {
        const next = [
          ...localEmulatorTabsRef.current.filter((candidate) => candidate.scopeKey === scopeKey),
          tab
        ]
        localEmulatorTabsRef.current = next
        setLocalEmulatorTabs(next)
      }
      switchEmulatorTab(tab)
    },
    [localEmulatorTabsRef, scopeKey, switchEmulatorTab]
  )

  const closeEmulatorTab = useCallback(
    (tab: MobileLocalEmulatorTab) => {
      setEmulatorActionTarget(null)
      const next = localEmulatorTabsRef.current.filter((candidate) => candidate.id !== tab.id)
      localEmulatorTabsRef.current = next
      setLocalEmulatorTabs(next)
      if (activeSessionTabIdRef.current !== tab.id) {
        return
      }
      const replacement = next[0]
      if (replacement) {
        switchEmulatorTab(replacement)
        return
      }
      const hostTab = sessionTabs[0]
      if (hostTab) {
        switchSessionTab(hostTab)
        return
      }
      selectedSessionTabIdRef.current = null
      activeSessionTabIdRef.current = null
      activeSessionTabTypeRef.current = null
      setActiveSessionTabId(null)
    },
    [localEmulatorTabsRef, sessionTabs, switchEmulatorTab, switchSessionTab]
  )

  return {
    appActive,
    localEmulatorTabs,
    emulatorActionTarget,
    setEmulatorActionTarget,
    activeEmulatorTab: localEmulatorTabs.find((tab) => tab.id === activeSessionTabId) ?? null,
    openEmulatorDevice,
    switchEmulatorTab,
    closeEmulatorTab
  }
}

export type MobileSessionEmulatorTabsModel = MobileSessionTabSwitchingModel &
  ReturnType<typeof useMobileSessionEmulatorTabs>
