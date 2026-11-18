import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useTodoOverviewOpen, useTodoOverviewStore } from './todo-overview-store'
import { useTodoOverviewSearch } from './use-todo-overview-search'

export type TodoOverview = ReturnType<typeof useTodoOverview>

/** State of the TODO view in the explorer's Contents mode for the active workspace. */
export function useTodoOverview({
  worktreeId,
  worktreePath,
  supportsGit,
  searchViewActive
}: {
  worktreeId: string | null
  worktreePath: string | null
  /** False for folder workspaces, which have no base to compare against. */
  supportsGit: boolean
  searchViewActive: boolean
}) {
  const open = useTodoOverviewOpen(worktreeId)
  const changedOnly = useTodoOverviewStore((s) =>
    worktreeId && supportsGit ? !!s.changedOnlyByWorktree[worktreeId] : false
  )
  const search = useTodoOverviewSearch({
    worktreeId: worktreeId ?? '',
    worktreePath: worktreePath ?? '',
    supportsGit,
    changedOnly,
    active: open && searchViewActive && !!worktreeId && !!worktreePath
  })
  const setOpen = useCallback(
    (next: boolean) => {
      if (worktreeId) {
        useTodoOverviewStore.getState().setOpen(worktreeId, next)
      }
    },
    [worktreeId]
  )
  const setChangedOnly = useCallback(
    (next: boolean) => {
      if (worktreeId) {
        useTodoOverviewStore.getState().setChangedOnly(worktreeId, next)
      }
    },
    [worktreeId]
  )
  // Why: Find in Files and "search for this" requests target the text query, which TODO mode hides.
  const searchRequestKey = useAppStore((s) => {
    const searchState = worktreeId ? s.fileSearchStateByWorktree[worktreeId] : undefined
    return `${searchState?.focusRequestId ?? 0}:${searchState?.seedRequestId ?? 0}`
  })
  const lastSearchRequest = useRef({ worktreeId, key: searchRequestKey })
  useEffect(() => {
    const last = lastSearchRequest.current
    lastSearchRequest.current = { worktreeId, key: searchRequestKey }
    if (last.worktreeId === worktreeId && last.key !== searchRequestKey) {
      setOpen(false)
    }
  }, [worktreeId, searchRequestKey, setOpen])
  const openSourceControl = useCallback(() => {
    useAppStore.getState().setRightSidebarTab('source-control')
  }, [])
  return {
    ...search,
    worktreeId,
    open,
    changedOnly,
    setOpen,
    setChangedOnly,
    openSourceControl
  }
}
