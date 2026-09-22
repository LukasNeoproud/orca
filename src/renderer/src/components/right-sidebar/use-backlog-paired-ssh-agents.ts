import { useCallback, useEffect, useRef, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { TuiAgent } from '../../../../shared/tui-agent'

export function useBacklogPairedSshAgents(
  environmentId: string | null,
  connectionId: string | null
) {
  const key = environmentId && connectionId ? JSON.stringify([environmentId, connectionId]) : null
  const currentKey = useRef(key)
  const [snapshot, setSnapshot] = useState<{
    key: string
    ids: TuiAgent[] | null
    loading: boolean
    failed: boolean
  } | null>(null)
  const inFlight = useRef<{ key: string; promise: Promise<TuiAgent[]> } | null>(null)
  const refresh = useCallback((): Promise<TuiAgent[]> => {
    if (!key || !environmentId || !connectionId) {
      return Promise.resolve([])
    }
    if (inFlight.current?.key === key) {
      return inFlight.current.promise
    }
    setSnapshot({ key, ids: null, loading: true, failed: false })
    const promise = callRuntimeRpc<TuiAgent[]>(
      { kind: 'environment', environmentId },
      'preflight.detectRemoteAgents',
      { connectionId }
    )
      .then((ids) => {
        if (currentKey.current === key) {
          setSnapshot({ key, ids, loading: false, failed: false })
        }
        return ids
      })
      .catch(() => {
        if (currentKey.current === key) {
          setSnapshot({ key, ids: null, loading: false, failed: true })
        }
        return []
      })
      .finally(() => {
        if (inFlight.current?.promise === promise) {
          inFlight.current = null
        }
      })
    inFlight.current = { key, promise }
    return promise
  }, [key, environmentId, connectionId])
  useEffect(() => {
    currentKey.current = key
    if (key) {
      void refresh()
    }
    return () => {
      currentKey.current = null
    }
  }, [key, refresh])
  const value = snapshot?.key === key ? snapshot : null
  return {
    detectedIds: value?.ids ?? null,
    isLoading: key !== null && (value?.loading ?? true),
    detectionFailed: value?.failed ?? false,
    isRefreshing: value?.loading ?? false,
    refresh
  }
}
