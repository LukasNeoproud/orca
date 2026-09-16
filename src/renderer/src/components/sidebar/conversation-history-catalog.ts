import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { AiVaultListResult } from '../../../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { describeAiVaultScanError } from '../../../../shared/ai-vault-scan-error-message'
import { isAiVaultScanCancellation } from '../right-sidebar/ai-vault-session-refresh'
import {
  aiVaultSessionResultCacheKey,
  cacheAiVaultSessionResult,
  readCachedAiVaultSessionResult
} from '../right-sidebar/ai-vault-session-result-cache'

const SIDEBAR_HISTORY_COVERAGE_KEY = 'unlimited'

export type ConversationHistoryCatalogSnapshot =
  | { status: 'idle'; result: null; error: null; coverageKey: string }
  | { status: 'loading'; result: null; error: null; coverageKey: string }
  | { status: 'ready'; result: AiVaultListResult; error: null; coverageKey: string }
  | { status: 'error'; result: null; error: string; coverageKey: string }

const snapshotsByHost = new Map<ExecutionHostId, ConversationHistoryCatalogSnapshot>()
const listenersByHost = new Map<ExecutionHostId, Set<() => void>>()
const inFlightByKey = new Map<string, Promise<void>>()
const pendingForcedRefreshByKey = new Set<string>()
const desiredCoverageByHost = new Map<ExecutionHostId, string>()
const idleSnapshotsByCoverage = new Map<string, ConversationHistoryCatalogSnapshot>()
const refreshKeyByHost = new Map<ExecutionHostId, string>()
const revalidateOnNextSubscriptionByHost = new Set<ExecutionHostId>()

function idleSnapshot(coverageKey: string): ConversationHistoryCatalogSnapshot {
  const cached = idleSnapshotsByCoverage.get(coverageKey)
  if (cached) {
    return cached
  }
  const snapshot = { status: 'idle', result: null, error: null, coverageKey } as const
  idleSnapshotsByCoverage.set(coverageKey, snapshot)
  return snapshot
}

function emit(hostId: ExecutionHostId): void {
  for (const listener of listenersByHost.get(hostId) ?? []) {
    listener()
  }
}

function publish(hostId: ExecutionHostId, snapshot: ConversationHistoryCatalogSnapshot): void {
  if (desiredCoverageByHost.get(hostId) !== snapshot.coverageKey) {
    return
  }
  snapshotsByHost.set(hostId, snapshot)
  emit(hostId)
}

function getSnapshot(
  hostId: ExecutionHostId,
  coverageKey: string
): ConversationHistoryCatalogSnapshot {
  const current = snapshotsByHost.get(hostId)
  return current?.coverageKey === coverageKey ? current : idleSnapshot(coverageKey)
}

function subscribe(hostId: ExecutionHostId, listener: () => void): () => void {
  const listeners = listenersByHost.get(hostId) ?? new Set<() => void>()
  listeners.add(listener)
  listenersByHost.set(hostId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      listenersByHost.delete(hostId)
      revalidateOnNextSubscriptionByHost.add(hostId)
    }
  }
}

function mergeCatalogResults(results: readonly AiVaultListResult[]): AiVaultListResult {
  const sessionsById = new Map(
    results.flatMap((result) => result.sessions.map((session) => [session.id, session] as const))
  )
  const issuesByKey = new Map(
    results.flatMap((result) =>
      result.issues.map((issue) => [
        JSON.stringify([issue.agent, issue.path, issue.message]),
        issue
      ])
    )
  )
  return {
    sessions: [...sessionsById.values()].sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt ?? right.modifiedAt)
      const leftTime = Date.parse(left.updatedAt ?? left.modifiedAt)
      const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0
      const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0
      return normalizedRightTime - normalizedLeftTime
    }),
    issues: [...issuesByKey.values()],
    scannedAt: results.reduce(
      (latest, result) => (result.scannedAt > latest ? result.scannedAt : latest),
      ''
    )
  }
}

async function loadChunk(
  hostId: ExecutionHostId,
  force: boolean,
  reuseRendererCache: boolean
): Promise<AiVaultListResult> {
  const scopePaths: readonly string[] = []
  const key = aiVaultSessionResultCacheKey(hostId, scopePaths)
  if (!force && reuseRendererCache) {
    const cached = readCachedAiVaultSessionResult({
      key,
      limit: 'unlimited',
      scopePaths
    })
    if (cached) {
      return cached
    }
  }
  const result = await window.api.aiVault.listSessions({
    executionHostScope: hostId,
    scopePaths,
    unlimited: true,
    force
  })
  if (!result.cancelled) {
    cacheAiVaultSessionResult({
      key,
      executionHostScope: hostId,
      limit: 'unlimited',
      result,
      replaceHostEntries: force
    })
  }
  return result
}

async function loadConversationHistoryCatalog(
  hostId: ExecutionHostId,
  coverageKey: string,
  force: boolean,
  reuseRendererCache: boolean
): Promise<void> {
  const requestKey = `${hostId}\n${coverageKey}`
  const existing = inFlightByKey.get(requestKey)
  if (existing) {
    if (force) {
      pendingForcedRefreshByKey.add(requestKey)
    }
    return existing
  }
  publish(hostId, { status: 'loading', result: null, error: null, coverageKey })
  const request = (async () => {
    try {
      const result = await loadChunk(hostId, force, reuseRendererCache)
      if (result.cancelled) {
        publish(hostId, idleSnapshot(coverageKey))
        return
      }
      publish(hostId, {
        status: 'ready',
        result: mergeCatalogResults([result]),
        error: null,
        coverageKey
      })
    } catch (error) {
      if (isAiVaultScanCancellation(error)) {
        publish(hostId, idleSnapshot(coverageKey))
        return
      }
      publish(hostId, {
        status: 'error',
        result: null,
        error: describeAiVaultScanError(error instanceof Error ? error.message : String(error)),
        coverageKey
      })
    } finally {
      inFlightByKey.delete(requestKey)
      if (pendingForcedRefreshByKey.delete(requestKey)) {
        void loadConversationHistoryCatalog(hostId, coverageKey, true, false)
      }
    }
  })()
  inFlightByKey.set(requestKey, request)
  return request
}

export function useConversationHistoryCatalog(
  hostId: ExecutionHostId,
  enabled: boolean,
  refreshKey: string
): ConversationHistoryCatalogSnapshot & { retry: () => void } {
  const coverageKey = SIDEBAR_HISTORY_COVERAGE_KEY
  const subscribeForHost = useCallback(
    (listener: () => void) => subscribe(hostId, listener),
    [hostId]
  )
  const readForHost = useCallback(() => getSnapshot(hostId, coverageKey), [coverageKey, hostId])
  const snapshot = useSyncExternalStore(subscribeForHost, readForHost, readForHost)

  useEffect(() => {
    if (!enabled) {
      return
    }
    desiredCoverageByHost.set(hostId, coverageKey)
    if (snapshot.status === 'idle') {
      void loadConversationHistoryCatalog(hostId, coverageKey, false, true)
    } else if (revalidateOnNextSubscriptionByHost.delete(hostId)) {
      void loadConversationHistoryCatalog(hostId, coverageKey, true, false)
    }
  }, [coverageKey, enabled, hostId, snapshot.status])

  const retry = useCallback(() => {
    if (enabled) {
      desiredCoverageByHost.set(hostId, coverageKey)
      void loadConversationHistoryCatalog(hostId, coverageKey, true, false)
    }
  }, [coverageKey, enabled, hostId])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const previous = refreshKeyByHost.get(hostId)
    refreshKeyByHost.set(hostId, refreshKey)
    if (previous !== undefined && previous !== refreshKey) {
      void loadConversationHistoryCatalog(hostId, coverageKey, true, false)
    }
  }, [coverageKey, enabled, hostId, refreshKey])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onRefocus = (): void => {
      if (document.visibilityState === 'visible') {
        void loadConversationHistoryCatalog(hostId, coverageKey, false, false)
      }
    }
    const unsubscribeWindowFocus = window.api.aiVault.onWindowFocused?.(onRefocus)
    document.addEventListener('visibilitychange', onRefocus)
    return () => {
      unsubscribeWindowFocus?.()
      document.removeEventListener('visibilitychange', onRefocus)
    }
  }, [coverageKey, enabled, hostId])

  return { ...snapshot, retry }
}

export function resetConversationHistoryCatalogForTests(): void {
  snapshotsByHost.clear()
  listenersByHost.clear()
  inFlightByKey.clear()
  pendingForcedRefreshByKey.clear()
  desiredCoverageByHost.clear()
  idleSnapshotsByCoverage.clear()
  refreshKeyByHost.clear()
  revalidateOnNextSubscriptionByHost.clear()
}
