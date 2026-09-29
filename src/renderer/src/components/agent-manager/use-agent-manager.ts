import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { PtyManagementSession } from '../../../../preload/api/pty-management-api'
import { buildManagerRows, type ManagerRow } from './agent-manager-model'
import {
  notifyDaemonSessionInventoryInvalidated,
  subscribeDaemonSessionInventoryInvalidated
} from '../status-bar/daemon-session-inventory-invalidation'

export type TerminationResult = {
  key: string
  label: string
  status: 'exited' | 'live' | 'unverifiable'
}

export function useAgentManager() {
  const ctx = useAppStore(
    useShallow((s) => ({
      tabsByWorktree: s.tabsByWorktree,
      ptyIdsByTabId: s.ptyIdsByTabId,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId,
      workspaceSessionReady: s.workspaceSessionReady,
      repos: s.repos,
      worktreesByRepo: s.worktreesByRepo,
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      runtimePaneTitlesByTabId: s.runtimePaneTitlesByTabId,
      lastTerminalInputAtByPaneKey: s.lastTerminalInputAtByPaneKey,
      memorySnapshot: s.memorySnapshot
    }))
  )
  const [sessions, setSessions] = useState<PtyManagementSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [incomplete, setIncomplete] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<TerminationResult[]>([])
  const mounted = useMountedRef()
  const generation = useRef(0)
  const mutation = useRef(false)
  const refreshing = useRef(false)
  const refreshAgain = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (mutation.current || refreshing.current) {
      refreshAgain.current = true
      return
    }
    refreshing.current = true
    const request = ++generation.current
    setLoading(true)
    try {
      do {
        refreshAgain.current = false
        const inventory = await window.api.pty.management.listSessions()
        if (!mounted.current || request !== generation.current || mutation.current) {
          return
        }
        const complete = inventory.inventoryStatus === 'complete'
        setIncomplete(!complete)
        setDegraded(inventory.degraded)
        setError(false)
        setSessions((previous) => {
          if (complete) {
            return inventory.sessions
          }
          // A failed daemon is not an empty daemon; retain last-known rows until verified.
          const next = new Map(previous.map((session) => [session.sessionId, session]))
          for (const session of inventory.sessions) {
            next.set(session.sessionId, session)
          }
          return [...next.values()]
        })
      } while (refreshAgain.current && !mutation.current)
    } catch {
      if (mounted.current && request === generation.current) {
        setError(true)
      }
    } finally {
      refreshing.current = false
      if (mounted.current) {
        setLoading(false)
        if (refreshAgain.current && !mutation.current) {
          refreshAgain.current = false
          void refresh()
        }
      }
    }
  }, [mounted])

  useEffect(() => {
    void refresh()
    const invalidate = () => {
      generation.current++
    }
    const queueRefresh = () => {
      void refresh()
    }
    const unsubscribe = subscribeDaemonSessionInventoryInvalidated(queueRefresh)
    const unsubscribeSpawn = window.api.pty.onSpawned(queueRefresh)
    const unsubscribeExit = window.api.pty.onExit(queueRefresh)
    window.addEventListener('focus', queueRefresh)
    return () => {
      invalidate()
      unsubscribe()
      unsubscribeSpawn()
      unsubscribeExit()
      window.removeEventListener('focus', queueRefresh)
    }
  }, [refresh])

  useEffect(() => {
    const fetch = () => {
      if (document.visibilityState !== 'hidden') {
        void useAppStore.getState().fetchMemorySnapshot()
      }
    }
    fetch()
    const timer = window.setInterval(fetch, 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const terminate = useCallback(
    async (targets: readonly ManagerRow[]) => {
      if (mutation.current || targets.length === 0) {
        return
      }
      mutation.current = true
      generation.current++
      setBusy(true)
      setResults([])
      const outcomes: TerminationResult[] = []
      try {
        // Bound concurrency avoids a large selection flooding daemon verification.
        for (let offset = 0; offset < targets.length; offset += 4) {
          const batch = await Promise.all(
            targets.slice(offset, offset + 4).map(async (row): Promise<TerminationResult> => {
              try {
                const result = await window.api.pty.management.killOne({
                  sessionId: row.session.sessionId,
                  incarnationId: row.session.incarnationId
                })
                return { key: row.key, label: row.label, status: result.status ?? 'unverifiable' }
              } catch {
                return { key: row.key, label: row.label, status: 'unverifiable' }
              }
            })
          )
          outcomes.push(...batch)
          if (mounted.current) {
            setResults([...outcomes])
          }
        }
      } finally {
        mutation.current = false
        notifyDaemonSessionInventoryInvalidated()
        if (mounted.current) {
          setBusy(false)
          await refresh()
        }
      }
    },
    [mounted, refresh]
  )

  const rows = useMemo(() => buildManagerRows(sessions, ctx), [sessions, ctx])
  return { rows, loading, error, incomplete, degraded, busy, results, refresh, terminate }
}
