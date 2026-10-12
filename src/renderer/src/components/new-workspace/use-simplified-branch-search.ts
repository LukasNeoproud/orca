import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { searchRuntimeRepoBaseRefDetails } from '@/runtime/runtime-repo-client'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { BaseRefSearchResult } from '../../../../shared/repo-types'

export function useSimplifiedBranchSearch(
  enabled: boolean,
  repoId: string,
  query: string,
  hostId?: ExecutionHostId | null
): BaseRefSearchResult[] {
  const [result, setResult] = useState<{
    query: string
    repoId: string
    hostId: typeof hostId
    rows: BaseRefSearchResult[]
  } | null>(null)
  useEffect(() => {
    if (!enabled || !repoId) {
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      const repo = useAppStore.getState().repos.find((entry) => entry.id === repoId)
      const ownerHostId = hostId ?? (repo ? getRepoExecutionHostId(repo) : null)
      void (
        ownerHostId
          ? searchRuntimeRepoBaseRefDetails(ownerHostId, repoId, query, 30)
          : Promise.resolve([])
      )
        .then((rows) => {
          if (!stale) {
            setResult({ query, repoId, hostId, rows })
          }
        })
        .catch(() => {
          if (!stale) {
            setResult({ query, repoId, hostId, rows: [] })
          }
        })
    }, 150)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [enabled, repoId, query, hostId])

  return enabled && result?.query === query && result.repoId === repoId && result.hostId === hostId
    ? result.rows
    : []
}
