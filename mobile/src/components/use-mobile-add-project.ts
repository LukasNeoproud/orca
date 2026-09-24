import { useCallback, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { getCachedRepos, setCachedRepos } from '../cache/repo-cache'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'

export type MobileAddProjectMode = 'existing' | 'create' | 'clone'
export type MobileAddProjectKind = 'git' | 'folder'

export type MobileAddProjectInput = {
  mode: MobileAddProjectMode
  kind: MobileAddProjectKind
  path: string
  name: string
  url: string
}

function responseRepo(value: unknown): MobileWorkspaceRepo {
  const result = value as { repo?: Partial<MobileWorkspaceRepo>; error?: unknown } | null
  if (typeof result?.error === 'string') {
    throw new Error(result.error)
  }
  const repo = result?.repo
  if (!repo || typeof repo.id !== 'string' || typeof repo.path !== 'string') {
    throw new Error(
      'The host added the project but returned an invalid response. Refresh the project list.'
    )
  }
  return {
    ...repo,
    id: repo.id,
    path: repo.path,
    displayName: typeof repo.displayName === 'string' ? repo.displayName : repo.path
  }
}

function requestFor(input: MobileAddProjectInput): { method: string; params: object } {
  const path = input.path.trim()
  if (input.mode === 'existing') {
    return { method: 'repo.add', params: { path, kind: input.kind } }
  }
  if (input.mode === 'create') {
    return {
      method: 'repo.create',
      params: { parentPath: path, name: input.name.trim(), kind: input.kind }
    }
  }
  return { method: 'repo.clone', params: { url: input.url.trim(), destination: path } }
}

export function useMobileAddProject(args: {
  client: RpcClient | null
  hostId?: string
  visible: boolean
  onCreated: (repo: MobileWorkspaceRepo) => void | Promise<void>
  onRefresh?: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previousVisible, setPreviousVisible] = useState(args.visible)
  const generation = useRef(0)

  if (previousVisible !== args.visible) {
    setPreviousVisible(args.visible)
    if (!args.visible) {
      generation.current++
      setBusy(false)
      setError('')
    }
  }

  const submit = useCallback(
    async (input: MobileAddProjectInput): Promise<boolean> => {
      if (busy) {
        return false
      }
      if (!args.client) {
        setError('Connect to the host before adding a project.')
        return false
      }
      const path = input.path.trim()
      if (!path) {
        setError(
          input.mode === 'create'
            ? 'Enter a parent folder on the host.'
            : 'Enter a path on the host.'
        )
        return false
      }
      if (input.mode === 'create' && !input.name.trim()) {
        setError('Enter a project name.')
        return false
      }
      if (input.mode === 'clone' && !input.url.trim()) {
        setError('Enter a Git URL.')
        return false
      }
      const current = ++generation.current
      setBusy(true)
      setError('')
      try {
        const request = requestFor(input)
        const response = await args.client.sendRequest(request.method, request.params, {
          timeoutMs: input.mode === 'clone' ? 10 * 60_000 : 60_000,
          failWhenDisconnected: true
        })
        if (current !== generation.current) {
          return false
        }
        if (!response.ok) {
          throw new Error(response.error.message || 'Could not add the project.')
        }
        const repo = responseRepo(response.result)
        if (args.hostId) {
          const cached = (getCachedRepos(args.hostId) ?? []) as MobileWorkspaceRepo[]
          setCachedRepos(args.hostId, [...cached.filter((item) => item.id !== repo.id), repo])
        }
        try {
          await args.onRefresh?.()
        } catch {
          // The repo is already persisted; selection can proceed from its RPC result.
        }
        if (current !== generation.current) {
          return false
        }
        await args.onCreated(repo)
        return true
      } catch (cause) {
        if (current === generation.current) {
          setError(cause instanceof Error ? cause.message : 'Could not add the project.')
        }
        return false
      } finally {
        if (current === generation.current) {
          setBusy(false)
        }
      }
    },
    [args.client, args.hostId, args.onCreated, args.onRefresh, busy]
  )

  return { busy, error, setError, submit }
}
