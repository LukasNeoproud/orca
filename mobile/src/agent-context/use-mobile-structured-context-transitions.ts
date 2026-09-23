import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import {
  cancelMobileStructuredContextTransition,
  inspectMobileStructuredContextTransition,
  mobileStructuredContextSource,
  supportsMobileStructuredContextTransitions,
  type MobileStructuredContextRequest,
  type MobileStructuredContextSnapshot,
  type MobileStructuredContextSource
} from './mobile-structured-context-transition'

type SnapshotState = {
  snapshot: MobileStructuredContextSnapshot
  source: MobileStructuredContextSource
}

export function useMobileStructuredContextTransitions(args: {
  client: RpcClient | null
  connectionState: ConnectionState
  hostCapabilities: readonly string[]
  sessions: readonly AiVaultSession[]
  worktreeId: string
}) {
  const { client, connectionState, hostCapabilities, sessions, worktreeId } = args
  const supported = supportsMobileStructuredContextTransitions(hostCapabilities)
  const sources = useMemo(() => contextSources(sessions, worktreeId), [sessions, worktreeId])
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({})
  const [error, setError] = useState<string | null>(null)
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    const visibleSessionIds = new Set(sources.map((source) => source.sessionId))
    setSnapshots((current) => {
      const retained = Object.entries(current).filter(([sessionId]) =>
        visibleSessionIds.has(sessionId)
      )
      return retained.length === Object.keys(current).length
        ? current
        : Object.fromEntries(retained)
    })
  }, [sources])

  const refresh = useCallback(async (): Promise<void> => {
    if (!client || connectionState !== 'connected' || !supported || sources.length === 0) {
      return
    }
    const generation = generationRef.current
    const results = await Promise.allSettled(
      sources.map(async (source) => ({
        source,
        snapshot: await inspectMobileStructuredContextTransition(client, source)
      }))
    )
    if (generationRef.current !== generation) {
      return
    }
    const fulfilled = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    )
    if (fulfilled.length > 0) {
      setSnapshots((current) => {
        const next = { ...current }
        for (const entry of fulfilled) {
          next[entry.source.sessionId] = entry
        }
        return next
      })
    }
    const rejection = results.find((result) => result.status === 'rejected')
    setError(
      rejection?.status === 'rejected'
        ? rejection.reason instanceof Error
          ? rejection.reason.message
          : 'Unable to confirm the context change.'
        : null
    )
  }, [client, connectionState, sources, supported])

  useEffect(() => {
    generationRef.current += 1
    if (!supported || sources.length === 0) {
      setSnapshots({})
      setError(null)
      return
    }
    if (!client || connectionState !== 'connected') {
      return
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 2_000)
    return () => clearInterval(timer)
  }, [client, connectionState, refresh, sources.length, supported])

  const cancel = useCallback(
    async (
      source: MobileStructuredContextSource,
      request: MobileStructuredContextRequest
    ): Promise<void> => {
      if (!client || connectionState !== 'connected' || cancelingRequestId) {
        return
      }
      const generation = generationRef.current
      setCancelingRequestId(request.requestId)
      setError(null)
      try {
        const snapshot = await cancelMobileStructuredContextTransition(client, source, request)
        if (generationRef.current === generation) {
          setSnapshots((current) => ({
            ...current,
            [source.sessionId]: { source, snapshot }
          }))
        }
      } catch (cause) {
        if (generationRef.current === generation) {
          setError(cause instanceof Error ? cause.message : 'Unable to cancel the context change.')
        }
      } finally {
        if (generationRef.current === generation) {
          setCancelingRequestId(null)
        }
      }
    },
    [cancelingRequestId, client, connectionState]
  )

  return {
    cancel,
    cancelingRequestId,
    connectionState,
    error,
    refresh,
    snapshots: Object.values(snapshots),
    sources,
    supported
  }
}

function contextSources(
  sessions: readonly AiVaultSession[],
  worktreeId: string
): MobileStructuredContextSource[] {
  const sources = new Map<string, MobileStructuredContextSource>()
  for (const session of sessions) {
    const source = mobileStructuredContextSource(session)
    if (source?.workspaceId === worktreeId) {
      sources.set(source.sessionId, source)
    }
  }
  return [...sources.values()]
}
