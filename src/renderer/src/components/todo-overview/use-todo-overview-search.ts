import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { readIpcErrorDetail } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import {
  createFileSearchResultOwner,
  isFileSearchResultOwnerCurrent,
  type FileSearchResultOwner
} from '@/lib/file-search-result-owner'
import { isRuntimeFileSearchTextWithinLimit } from '@/runtime/runtime-file-search-bounds'
import { searchRuntimeFiles } from '@/runtime/runtime-file-search-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import {
  getFileExplorerOperationExecutionHostId,
  getFileExplorerOperationOwnerFromState,
  getFileExplorerOperationRoute,
  getFileExplorerOwnerUnresolvedMessage
} from '../right-sidebar/file-explorer-operation-owner'
import type { SearchResult } from '../../../../shared/code-search-types'
import { collectTodoChangedFiles, type TodoChangedFiles } from './todo-changed-files'
import {
  buildChangedFilesIncludePattern,
  TODO_COMMENT_QUERY,
  TODO_OVERVIEW_MAX_RESULTS,
  toTodoOverviewResult
} from '../../../../shared/todo-comment-search'

export type TodoOverviewSearchState = {
  results: SearchResult | null
  owner: FileSearchResultOwner | null
  loading: boolean
  error: string | null
}

const IDLE: TodoOverviewSearchState = { results: null, owner: null, loading: false, error: null }

/** Changed files of the workspace, or null when it has no git to compare against. */
function useTodoChangedFiles(worktreeId: string, supportsGit: boolean): TodoChangedFiles | null {
  const statusEntries = useAppStore((s) => s.gitStatusByWorktree[worktreeId])
  const branchSummary = useAppStore((s) => s.gitBranchCompareSummaryByWorktree[worktreeId])
  const branchEntries = useAppStore((s) => s.gitBranchChangesByWorktree[worktreeId])
  return useMemo(
    () =>
      supportsGit ? collectTodoChangedFiles(statusEntries, branchSummary, branchEntries) : null,
    [supportsGit, statusEntries, branchSummary, branchEntries]
  )
}

/**
 * Runs the TODO/FIXME search through the same host route as the Contents search, so the bundled
 * ripgrep runs locally, in WSL, or on the SSH/runtime host that owns the workspace.
 */
export function useTodoOverviewSearch({
  worktreeId,
  worktreePath,
  supportsGit,
  changedOnly,
  active
}: {
  worktreeId: string
  worktreePath: string
  supportsGit: boolean
  changedOnly: boolean
  active: boolean
}): {
  state: TodoOverviewSearchState
  changedFiles: TodoChangedFiles | null
  refresh: () => void
} {
  // Why: route by the workspace's own host, like the explorer tree, never by the focused server.
  const hostOwner = useAppStore(
    useShallow((s) => getFileExplorerOperationOwnerFromState(s, worktreeId))
  )
  const runtimeEnvironmentId = hostOwner.kind === 'runtime' ? hostOwner.environmentId : null
  const executionHostId = getFileExplorerOperationExecutionHostId(hostOwner)
  const route = getFileExplorerOperationRoute(hostOwner)
  const connectionId = route?.connectionId
  const changedFiles = useTodoChangedFiles(worktreeId, supportsGit)
  const filterPaths = changedOnly && changedFiles ? changedFiles.paths : null
  // Why: git status polling hands out new arrays; only a different set of files is a new search.
  const filterKey = filterPaths ? filterPaths.join('\n') : null
  const [state, setState] = useState<TodoOverviewSearchState>(IDLE)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    if (!active) {
      return
    }
    if (executionHostId === null) {
      setState({ ...IDLE, error: getFileExplorerOwnerUnresolvedMessage() })
      return
    }
    const owner = createFileSearchResultOwner(worktreeId, runtimeEnvironmentId, {
      rootPath: worktreePath,
      executionHostId
    })
    const paths = filterKey === null ? null : filterKey ? filterKey.split('\n') : []
    if (paths && paths.length === 0) {
      setState({
        results: { files: [], totalMatches: 0, truncated: false },
        owner,
        loading: false,
        error: null
      })
      return
    }
    const controller = new AbortController()
    // Why: keep the old list while refreshing the same workspace, never across workspaces or hosts.
    setState((previous) =>
      isFileSearchResultOwnerCurrent(
        previous.owner,
        worktreeId,
        worktreePath,
        runtimeEnvironmentId,
        executionHostId
      )
        ? { ...previous, loading: true, error: null }
        : { ...IDLE, loading: true }
    )
    const includePattern = paths
      ? buildChangedFilesIncludePattern(paths, (pattern) =>
          isRuntimeFileSearchTextWithinLimit(pattern)
        )
      : null
    void searchRuntimeFiles(
      {
        target: runtimeTargetForOwnerEnvironment(runtimeEnvironmentId),
        worktreeId,
        worktreePath,
        connectionId
      },
      {
        query: TODO_COMMENT_QUERY,
        rootPath: worktreePath,
        caseSensitive: true,
        useRegex: true,
        includePattern: includePattern ?? undefined,
        maxResults: TODO_OVERVIEW_MAX_RESULTS
      },
      controller.signal
    ).then(
      (result) => {
        if (!controller.signal.aborted) {
          const results = toTodoOverviewResult(result, paths ? new Set(paths) : null)
          setState({ results, owner, loading: false, error: null })
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            results: null,
            owner,
            loading: false,
            error:
              readIpcErrorDetail(error) ??
              translate('fileSearch.failed', 'Search failed. Try again.')
          })
        }
      }
    )
    return () => controller.abort()
  }, [
    active,
    worktreeId,
    worktreePath,
    runtimeEnvironmentId,
    executionHostId,
    connectionId,
    filterKey,
    refreshToken
  ])

  return { state, changedFiles, refresh }
}
