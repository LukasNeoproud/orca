import type { RpcClient } from '../transport/rpc-client'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewFileDiff
} from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'

// Why bounded: image sides arrive as base64, and a long PR would otherwise keep every one in memory.
const MAX_CACHED_DIFFS = 24
const cache = new Map<string, Promise<AzureDevOpsReviewFileDiff>>()

/** One file's diff, shared by every mount of the same file in the same iteration. */
export function loadAzureDevOpsReviewFileDiff(
  client: RpcClient | null,
  pullRequestKey: string,
  iterationId: number | null,
  change: Pick<AzureDevOpsReviewChange, 'path' | 'originalPath'>
): Promise<AzureDevOpsReviewFileDiff> {
  const key = `${pullRequestKey}\n${iterationId ?? ''}\n${change.originalPath ?? ''}\n${change.path}`
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  const loading = azureDevOpsReviewRequest<AzureDevOpsReviewFileDiff>(
    client,
    'azureDevOpsReview.fileDiff',
    { pullRequestKey, path: change.path, originalPath: change.originalPath }
  )
  cache.set(key, loading)
  // A failed load must not stick: the next mount retries.
  loading.catch(() => cache.delete(key))
  while (cache.size > MAX_CACHED_DIFFS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
  return loading
}
