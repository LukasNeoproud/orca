import { useCallback, useEffect, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { getCachedRepos, setCachedRepos } from '../cache/repo-cache'
import { useLastVisitedWorktreeRepoId } from '../worktree/use-last-visited-worktree-repo'
import {
  getMobileNewWorkspaceDialogEligibleRepos,
  refreshMobileNewWorkspaceDialogSelectedRepo,
  resolveMobileNewWorkspaceDialogRepoId
} from '../worktree/new-workspace-dialog-repo-selection'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'

export function useNewWorkspaceRepositories(args: {
  client: RpcClient | null
  hostId?: string
  visible: boolean
}): {
  repos: MobileWorkspaceRepo[]
  selectedRepo: MobileWorkspaceRepo | null
  setSelectedRepo: (repo: MobileWorkspaceRepo | null) => void
  loading: boolean
  refreshRepos: (preferredRepoId: string) => Promise<void>
} {
  const { client, hostId, visible } = args
  const [initialRepos] = useState(() =>
    hostId ? (getCachedRepos(hostId) as MobileWorkspaceRepo[] | null) : null
  )
  const [repos, setRepos] = useState<MobileWorkspaceRepo[]>(initialRepos ?? [])
  const [selectedRepo, setSelectedRepo] = useState<MobileWorkspaceRepo | null>(null)
  const [loading, setLoading] = useState(initialRepos == null)
  const listRequestGenerationRef = useRef(0)
  const lastVisitedRepo = useLastVisitedWorktreeRepoId(hostId, visible)

  const refreshRepos = useCallback(
    async (preferredRepoId: string): Promise<void> => {
      if (!client) {
        return
      }
      const generation = ++listRequestGenerationRef.current
      try {
        const response = await client.sendRequest('repo.list')
        if (generation !== listRequestGenerationRef.current) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error.message)
        }
        const result = (response as RpcSuccess).result as { repos: MobileWorkspaceRepo[] }
        setRepos(result.repos)
        if (hostId) {
          setCachedRepos(hostId, result.repos)
        }
        const preferred = result.repos.find((repo) => repo.id === preferredRepoId)
        if (!preferred) {
          throw new Error('The new project is not available yet. Reopen the form to retry.')
        }
        setSelectedRepo(preferred)
      } finally {
        if (generation === listRequestGenerationRef.current) {
          setLoading(false)
        }
      }
    },
    [client, hostId]
  )

  useEffect(() => {
    if (!visible || !lastVisitedRepo.loaded || selectedRepo || repos.length === 0) {
      return
    }
    const eligibleRepos = getMobileNewWorkspaceDialogEligibleRepos(repos)
    const preferredRepoId = resolveMobileNewWorkspaceDialogRepoId({
      eligibleRepos,
      activeRepoId: lastVisitedRepo.repoId
    })
    const preferredRepo = repos.find((repo) => repo.id === preferredRepoId) ?? null
    if (preferredRepo) {
      setSelectedRepo(preferredRepo)
    }
  }, [lastVisitedRepo.loaded, lastVisitedRepo.repoId, repos, selectedRepo, visible])

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    let stale = false
    const generation = ++listRequestGenerationRef.current
    setLoading(true)
    void client
      .sendRequest('repo.list')
      .then((response) => {
        if (stale || generation !== listRequestGenerationRef.current || !response.ok) {
          return
        }
        const result = (response as RpcSuccess).result as { repos: MobileWorkspaceRepo[] }
        setRepos(result.repos)
        if (hostId) {
          setCachedRepos(hostId, result.repos)
        }
        setSelectedRepo((current) =>
          refreshMobileNewWorkspaceDialogSelectedRepo(result.repos, current)
        )
      })
      .catch(() => undefined)
      .finally(() => {
        if (!stale && generation === listRequestGenerationRef.current) {
          setLoading(false)
        }
      })
    return () => {
      stale = true
      listRequestGenerationRef.current += 1
    }
  }, [visible, client, hostId])

  return {
    repos,
    selectedRepo,
    setSelectedRepo,
    loading: loading && repos.length === 0,
    refreshRepos
  }
}
