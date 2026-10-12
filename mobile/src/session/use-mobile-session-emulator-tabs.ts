import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Keyboard } from 'react-native'
import { useFocusEffect } from 'expo-router'
import type { MobileEmulatorDevice } from '../emulator/mobile-emulator-types'
import { triggerSelection } from '../platform/haptics'
import { mobileEmulatorTabId, type MobileLocalEmulatorTab } from './mobile-local-emulator-tab'
import {
  cachedMobileLocalEmulatorTabs,
  loadMobileLocalEmulatorTabs,
  saveMobileLocalEmulatorTabs,
  type MobileLocalEmulatorTabsSnapshot
} from './mobile-local-emulator-tabs-persistence'
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
    pendingSelectionRef,
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
  const [appStateActive, setAppStateActive] = useState(AppState.currentState === 'active')
  const [routeFocused, setRouteFocused] = useState(false)
  const [restoredScopeKey, setRestoredScopeKey] = useState<string | null>(null)
  const mutationRevisionRef = useRef(0)
  const explicitHostSelectionDuringLoadRef = useRef(false)
  const scopeKey = `${hostId}:${worktreeId}`

  const saveTabs = useCallback(
    (snapshot: MobileLocalEmulatorTabsSnapshot) => {
      mutationRevisionRef.current += 1
      setRestoredScopeKey(scopeKey)
      void saveMobileLocalEmulatorTabs(hostId, worktreeId, scopeKey, snapshot).catch(() => {})
    },
    [hostId, scopeKey, worktreeId]
  )

  useFocusEffect(
    useCallback(() => {
      setRouteFocused(true)
      return () => setRouteFocused(false)
    }, [])
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppStateActive(state === 'active')
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    let disposed = false
    const revision = mutationRevisionRef.current
    explicitHostSelectionDuringLoadRef.current = false
    localEmulatorTabsRef.current = []
    setLocalEmulatorTabs([])
    setEmulatorActionTarget(null)
    if (activeSessionTabIdRef.current?.startsWith('mobile-emulator:')) {
      activeSessionTabIdRef.current = null
      selectedSessionTabIdRef.current = null
      activeSessionTabTypeRef.current = null
      setActiveSessionTabId(null)
    }
    const restore = (snapshot: MobileLocalEmulatorTabsSnapshot) => {
      if (disposed || revision !== mutationRevisionRef.current) {
        return
      }
      localEmulatorTabsRef.current = snapshot.tabs
      setLocalEmulatorTabs(snapshot.tabs)
      if (
        snapshot.selectedTabId &&
        !explicitHostSelectionDuringLoadRef.current &&
        !pendingSelectionRef.current
      ) {
        selectedSessionTabIdRef.current = snapshot.selectedTabId
        activeSessionTabTypeRef.current = 'emulator'
        activeSessionTabIdRef.current = snapshot.selectedTabId
        setActiveSessionTabId(snapshot.selectedTabId)
      }
      setRestoredScopeKey(scopeKey)
    }
    const cached = cachedMobileLocalEmulatorTabs(scopeKey)
    if (cached) {
      restore(cached)
    } else {
      void loadMobileLocalEmulatorTabs(hostId, worktreeId, scopeKey).then(restore, () => {
        if (!disposed) {
          setRestoredScopeKey(scopeKey)
        }
      })
    }
    return () => {
      disposed = true
    }
  }, [hostId, worktreeId, localEmulatorTabsRef, setLocalEmulatorTabs])

  useEffect(() => {
    if (restoredScopeKey !== scopeKey) {
      if (pendingSelectionRef.current) {
        explicitHostSelectionDuringLoadRef.current = true
      }
      return
    }
    const snapshot = cachedMobileLocalEmulatorTabs(scopeKey)
    if (!snapshot) {
      return
    }
    const selectedTabId = localEmulatorTabsRef.current.some(
      (tab) => tab.scopeKey === scopeKey && tab.id === activeSessionTabId
    )
      ? activeSessionTabId
      : null
    if (snapshot.selectedTabId !== selectedTabId) {
      saveTabs({ tabs: localEmulatorTabsRef.current, selectedTabId })
    }
  }, [activeSessionTabId, localEmulatorTabsRef, restoredScopeKey, saveTabs, scopeKey])

  const switchEmulatorTab = useCallback(
    (tab: MobileLocalEmulatorTab) => {
      triggerSelection()
      Keyboard.dismiss()
      setSelectModeActive(false)
      pendingSelectionRef.current = null
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
      saveTabs({ tabs: localEmulatorTabsRef.current, selectedTabId: tab.id })
    },
    [initializedHandlesRef, saveTabs, unsubscribeTerminal]
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
      saveTabs({
        tabs: next,
        selectedTabId: next.some((candidate) => candidate.id === activeSessionTabIdRef.current)
          ? activeSessionTabIdRef.current
          : null
      })
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
    [localEmulatorTabsRef, saveTabs, sessionTabs, switchEmulatorTab, switchSessionTab]
  )

  return {
    appActive: appStateActive && routeFocused,
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
