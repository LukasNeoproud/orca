import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'

export type AllRefsGitGraphState = {
  status: 'loading' | 'ready' | 'error'
  /** Refs and flags of the first page; later pages only append commits. */
  head?: GitHistoryResult
  items: GitHistoryItem[]
  hasMore: boolean
  loadingMore: boolean
  /** False when the host predates all-refs history and answered with the current branch only. */
  allRefsSupported: boolean
  error?: string
}

const INITIAL_STATE: AllRefsGitGraphState = {
  status: 'loading',
  items: [],
  hasMore: false,
  loadingMore: false,
  allRefsSupported: true
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Pages through the history of every branch and tag while the graph window is open. */
export function useAllRefsGitGraph({
  open,
  load
}: {
  open: boolean
  load: (skip: number) => Promise<GitHistoryResult>
}): {
  state: AllRefsGitGraphState
  refresh: () => void
  loadMore: () => void
} {
  const [state, setState] = useState<AllRefsGitGraphState>(INITIAL_STATE)
  const requestSeqRef = useRef(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const refresh = useCallback((): void => {
    const requestId = (requestSeqRef.current += 1)
    setState((previous) => ({
      ...previous,
      status: 'loading',
      loadingMore: false,
      error: undefined
    }))
    load(0)
      .then((result) => {
        if (requestSeqRef.current !== requestId) {
          return
        }
        const allRefsSupported = result.scope === 'all'
        setState({
          status: 'ready',
          head: result,
          items: result.items,
          // Why: an older host ignores `skip` too, so paging it would repeat the first page.
          hasMore: allRefsSupported && result.hasMore,
          loadingMore: false,
          allRefsSupported
        })
      })
      .catch((error: unknown) => {
        if (requestSeqRef.current !== requestId) {
          return
        }
        setState((previous) => ({
          ...previous,
          status: 'error',
          loadingMore: false,
          error: errorMessage(error)
        }))
      })
  }, [load])

  const loadMore = useCallback((): void => {
    const current = stateRef.current
    if (current.status !== 'ready' || !current.hasMore || current.loadingMore) {
      return
    }
    const requestId = (requestSeqRef.current += 1)
    stateRef.current = { ...current, loadingMore: true, error: undefined }
    setState(stateRef.current)
    load(current.items.length)
      .then((result) => {
        if (requestSeqRef.current !== requestId) {
          return
        }
        setState((previous) => {
          // Refs can move between pages; never list a commit twice.
          const known = new Set(previous.items.map((item) => item.id))
          const fresh = result.items.filter((item) => !known.has(item.id))
          return {
            ...previous,
            items: [...previous.items, ...fresh],
            hasMore: result.hasMore && fresh.length > 0,
            loadingMore: false
          }
        })
      })
      .catch((error: unknown) => {
        if (requestSeqRef.current !== requestId) {
          return
        }
        setState((previous) => ({ ...previous, loadingMore: false, error: errorMessage(error) }))
      })
  }, [load])

  useEffect(() => {
    if (!open) {
      // Invalidate in-flight pages so a reopen never receives a stale one.
      requestSeqRef.current += 1
      return
    }
    setState(INITIAL_STATE)
    refresh()
  }, [open, refresh])

  return { state, refresh, loadMore }
}
