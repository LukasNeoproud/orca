import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiVaultListResult, AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { ExecutionHostId } from '../../../src/shared/execution-host'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcSuccess } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import { buildMobileWorkspaceConversationHistory } from './mobile-workspace-conversation-history'

type HostCatalog =
  | { status: 'loading'; sessions: null; error: null }
  | { status: 'ready'; sessions: AiVaultSession[]; error: null }
  | { status: 'error'; sessions: null; error: string }

export function useMobileWorkspaceConversationCatalog(args: {
  client: RpcClient | null
  connState: ConnectionState
  enabled: boolean
  requestedHostIds: readonly ExecutionHostId[]
  worktrees: readonly Worktree[]
}) {
  const { client, connState, enabled, requestedHostIds, worktrees } = args
  const [catalogs, setCatalogs] = useState<ReadonlyMap<ExecutionHostId, HostCatalog>>(new Map())
  const inFlight = useRef(new Set<ExecutionHostId>())
  const generation = useRef(0)
  const requestedKey = [...requestedHostIds].sort().join('\n')

  const load = useCallback(
    async (executionHostId: ExecutionHostId) => {
      if (
        !client ||
        connState !== 'connected' ||
        !enabled ||
        inFlight.current.has(executionHostId)
      ) {
        return
      }
      inFlight.current.add(executionHostId)
      const requestGeneration = generation.current
      setCatalogs((current) =>
        new Map(current).set(executionHostId, {
          status: 'loading',
          sessions: null,
          error: null
        })
      )
      try {
        const response = await client.sendRequest('aiVault.listSessions', {
          executionHostScope: executionHostId,
          unlimited: true,
          scopePaths: []
        })
        if (generation.current !== requestGeneration) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error?.message || 'Unable to load conversations')
        }
        const result = (response as RpcSuccess).result as AiVaultListResult
        setCatalogs((current) =>
          new Map(current).set(executionHostId, {
            status: 'ready',
            sessions: result.sessions,
            error: null
          })
        )
      } catch (error) {
        if (generation.current !== requestGeneration) {
          return
        }
        setCatalogs((current) =>
          new Map(current).set(executionHostId, {
            status: 'error',
            sessions: null,
            error: error instanceof Error ? error.message : 'Unable to load conversations'
          })
        )
      } finally {
        if (generation.current === requestGeneration) {
          inFlight.current.delete(executionHostId)
        }
      }
    },
    [client, connState, enabled]
  )

  useEffect(() => {
    generation.current += 1
    inFlight.current.clear()
    setCatalogs(new Map())
  }, [client])

  useEffect(() => {
    if (connState !== 'connected' || !enabled) {
      return
    }
    for (const hostId of requestedKey.split('\n')) {
      if (hostId) {
        void load(hostId as ExecutionHostId)
      }
    }
    // A host is requested only when its first row expands; loads are host-scoped.
  }, [requestedKey, load, connState, enabled])

  const sessionsByHost = useMemo(() => {
    const result = new Map<ExecutionHostId, readonly AiVaultSession[]>()
    for (const [hostId, catalog] of catalogs) {
      if (catalog.status === 'ready') {
        result.set(hostId, catalog.sessions)
      }
    }
    return result
  }, [catalogs])
  const sessionsByWorkspace = useMemo(
    () => buildMobileWorkspaceConversationHistory(worktrees, sessionsByHost),
    [worktrees, sessionsByHost]
  )
  return { catalogs, sessionsByWorkspace, retry: load }
}
