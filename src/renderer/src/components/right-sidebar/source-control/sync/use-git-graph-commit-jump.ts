import { useCallback, useEffect, useRef } from 'react'

// A branch tip older than this many loaded commits is reported instead of paged to.
const JUMP_LOAD_LIMIT = 3000

/**
 * Scrolls the graph to a commit that may not be loaded yet, paging until it appears.
 * `onFound` receives the commit's row index; `onMissing` runs when history ends without it.
 */
export function useGitGraphCommitJump({
  commitIds,
  canLoadMore,
  loading,
  loadMore,
  onFound,
  onMissing
}: {
  commitIds: readonly string[]
  canLoadMore: boolean
  loading: boolean
  loadMore: () => void
  onFound: (index: number, commitId: string) => void
  onMissing: () => void
}): (commitId: string) => void {
  // A ref, not state: the next page arriving is what re-runs the search.
  const targetRef = useRef<string | null>(null)
  const seek = useCallback((): void => {
    const target = targetRef.current
    if (!target || loading) {
      return
    }
    const index = commitIds.indexOf(target)
    if (index !== -1) {
      onFound(index, target)
    } else if (canLoadMore && commitIds.length < JUMP_LOAD_LIMIT) {
      loadMore()
      return
    } else {
      onMissing()
    }
    targetRef.current = null
  }, [canLoadMore, commitIds, loadMore, loading, onFound, onMissing])
  useEffect(seek, [seek])
  return useCallback(
    (commitId: string): void => {
      targetRef.current = commitId
      seek()
    },
    [seek]
  )
}
