import { useCallback, useEffect, useRef, useState } from 'react'
import { BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY } from '../../../src/shared/backlog-task-association'
import {
  BACKLOG_RUNTIME_CAPABILITY,
  type BacklogSnapshot,
  type BacklogTask
} from '../../../src/shared/backlog-types'
import { useHostClient, useForceReconnect } from '../transport/client-context'
import type { RpcSuccess } from '../transport/types'

type BacklogScreenState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: BacklogSnapshot }

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; task: BacklogTask }

const SNAPSHOT_POLL_MS = 3_000
let nextLeaseNumber = 0

export function useMobileBacklog(hostId: string, worktreeId: string) {
  const { client, state: connState } = useHostClient(hostId)
  const forceReconnect = useForceReconnect()
  const [screenState, setScreenState] = useState<BacklogScreenState>({ kind: 'loading' })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [taskActionsSupported, setTaskActionsSupported] = useState<boolean | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    if (!client || connState !== 'connected') {
      setScreenState((previous) =>
        previous.kind === 'ready'
          ? previous
          : { kind: 'error', message: 'Waiting for host connection' }
      )
      return
    }

    const leaseId = `mobile-backlog-${Date.now()}-${++nextLeaseNumber}`
    const target = { workspaceId: worktreeId, leaseId }
    let stopped = false
    let leased = false
    let supported = false
    let polling = false
    let pending: Promise<void> | null = null
    const current = () => !stopped && generationRef.current === generation
    const poll = async (): Promise<void> => {
      if (polling) {
        return
      }
      polling = true
      try {
        leased = true
        const response = await client.sendRequest('backlog.snapshot', target)
        if (!current()) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error?.message || 'Unable to load Backlog')
        }
        const snapshot = (response as RpcSuccess).result as BacklogSnapshot
        setScreenState(
          snapshot.state === 'error'
            ? { kind: 'error', message: snapshot.error || 'Backlog unavailable' }
            : { kind: 'ready', snapshot }
        )
      } catch (error) {
        if (current()) {
          setScreenState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unable to load Backlog'
          })
        }
      } finally {
        polling = false
      }
    }
    const interval = setInterval(() => {
      if (supported && current() && !polling) {
        pending = poll()
      }
    }, SNAPSHOT_POLL_MS)
    pending = (async () => {
      try {
        const response = await client.sendRequest('status.get')
        if (!current()) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error?.message || 'Unable to reach host')
        }
        const capabilities = ((response as RpcSuccess).result as { capabilities?: string[] })
          .capabilities
        setTaskActionsSupported(
          capabilities?.includes(BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY) ?? false
        )
        if (!capabilities?.includes(BACKLOG_RUNTIME_CAPABILITY)) {
          setScreenState({ kind: 'unsupported' })
          return
        }
        supported = true
        await poll()
      } catch (error) {
        if (current()) {
          setScreenState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unable to load Backlog'
          })
        }
      }
    })()
    return () => {
      stopped = true
      clearInterval(interval)
      if (leased) {
        void pending?.finally(() => {
          void client.sendRequest('backlog.releaseSnapshot', target).catch(() => {})
        })
      }
    }
  }, [client, connState, worktreeId, refreshKey])

  useEffect(() => {
    if (!selectedTaskId || !client || connState !== 'connected') {
      return
    }
    let cancelled = false
    setDetailState({ kind: 'loading' })
    void client
      .sendRequest('backlog.task', { workspaceId: worktreeId, taskId: selectedTaskId })
      .then(
        (response) => {
          if (cancelled) {
            return
          }
          if (!response.ok) {
            setDetailState({
              kind: 'error',
              message: response.error?.message || 'Unable to load task'
            })
            return
          }
          setDetailState({ kind: 'ready', task: (response as RpcSuccess).result as BacklogTask })
        },
        (error: unknown) => {
          if (!cancelled) {
            setDetailState({
              kind: 'error',
              message: error instanceof Error ? error.message : 'Unable to load task'
            })
          }
        }
      )
    return () => {
      cancelled = true
    }
  }, [client, connState, worktreeId, selectedTaskId, refreshKey])

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])
  const retry = useCallback(() => {
    if (connState !== 'connected') {
      void forceReconnect?.(hostId)
    }
    refresh()
  }, [connState, forceReconnect, hostId, refresh])
  return {
    connState,
    screenState,
    selectedTaskId,
    setSelectedTaskId,
    detailState,
    taskActionsSupported,
    refresh,
    retry
  }
}
