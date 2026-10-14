import { useEffect, useState } from 'react'
import { getAzureDevOpsReviewFileDiff } from '@/lib/azure-devops-review-client'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewFileDiff
} from '../../../../shared/azure-devops-review-types'

const CACHE_LIMIT = 40
// Why: flipping between files must not refetch both sides every time; keyed by iteration so a push invalidates.
const fileDiffCache = new Map<string, AzureDevOpsReviewFileDiff>()
const inFlight = new Map<string, Promise<AzureDevOpsReviewFileDiff>>()

function cacheKey(pullRequestKey: string, iterationId: number | null, path: string): string {
  return `${pullRequestKey}\0${iterationId ?? 'none'}\0${path}`
}

/** Both sides of one changed file, shared by the single-file and all-changes views. */
export function loadAzureDevOpsReviewFileDiff(
  pullRequestKey: string,
  iterationId: number | null,
  change: AzureDevOpsReviewChange
): Promise<AzureDevOpsReviewFileDiff> {
  const key = cacheKey(pullRequestKey, iterationId, change.path)
  const cached = fileDiffCache.get(key)
  if (cached) {
    return Promise.resolve(cached)
  }
  const pending = inFlight.get(key)
  if (pending) {
    return pending
  }
  const request = getAzureDevOpsReviewFileDiff({
    pullRequestKey,
    path: change.path,
    originalPath: change.originalPath
  })
    .then((diff) => {
      if (fileDiffCache.size >= CACHE_LIMIT) {
        const oldest = fileDiffCache.keys().next().value
        if (oldest !== undefined) {
          fileDiffCache.delete(oldest)
        }
      }
      fileDiffCache.set(key, diff)
      return diff
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

export function useAzureDevOpsReviewFileDiff(
  pullRequestKey: string,
  iterationId: number | null,
  change: AzureDevOpsReviewChange | null
): {
  diff: AzureDevOpsReviewFileDiff | null
  loading: boolean
  error: string | null
  retry: () => void
} {
  const [state, setState] = useState<{
    key: string | null
    diff: AzureDevOpsReviewFileDiff | null
    error: string | null
  }>({ key: null, diff: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const key = change ? cacheKey(pullRequestKey, iterationId, change.path) : null

  useEffect(() => {
    if (!change || !key) {
      return
    }
    const cached = fileDiffCache.get(key)
    if (cached) {
      setState({ key, diff: cached, error: null })
      return
    }
    let current = true
    setState({ key, diff: null, error: null })
    loadAzureDevOpsReviewFileDiff(pullRequestKey, iterationId, change)
      .then((diff) => {
        if (current) {
          setState({ key, diff, error: null })
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setState({
            key,
            diff: null,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
    return () => {
      current = false
    }
  }, [attempt, change, iterationId, key, pullRequestKey])

  const matches = state.key === key
  return {
    diff: matches ? state.diff : null,
    loading: key !== null && (!matches || (state.diff === null && state.error === null)),
    error: matches ? state.error : null,
    retry: () => setAttempt((value) => value + 1)
  }
}
