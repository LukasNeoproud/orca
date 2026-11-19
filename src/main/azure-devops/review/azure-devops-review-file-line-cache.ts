import {
  getAzureDevOpsReviewItemAtCommit,
  type AzureDevOpsReviewTarget
} from './azure-devops-review-client'
import { toAzureDevOpsReviewFileSide } from './azure-devops-review-file-side'
import { azureDevOpsReviewContentLines } from './azure-devops-review-line-tracking'
import { toAzureDevOpsItemPath } from './azure-devops-review-mappers'
import type { AzureDevOpsReviewLineLoader } from './azure-devops-review-thread-tracking'

const MAX_CACHED_CHARS = 16_000_000

// Why: every uncached file version is one request; the rest waits for the next load of the detail.
const MAX_REQUESTS_PER_LOADER = 80

type CachedLines = { lines: readonly string[] | null; chars: number }

// A file at a commit never changes, so entries only leave to bound memory.
const cache = new Map<string, CachedLines>()
let cachedChars = 0

function remember(key: string, entry: CachedLines): void {
  cache.set(key, entry)
  cachedChars += entry.chars
  for (const [oldestKey, oldest] of cache) {
    if (cachedChars <= MAX_CACHED_CHARS || oldestKey === key) {
      break
    }
    cache.delete(oldestKey)
    cachedChars -= oldest.chars
  }
}

/** Reads file versions for thread tracking; a version it cannot compare resolves to null. */
export function createAzureDevOpsReviewLineLoader(
  target: AzureDevOpsReviewTarget & { repositoryId: string }
): AzureDevOpsReviewLineLoader {
  let requests = 0
  return async (path, commit) => {
    const key = `${target.organizationKey}\n${target.repositoryId}\n${commit}\n${path}`
    const cached = cache.get(key)
    if (cached) {
      // Re-insert so the entry counts as recently used.
      cache.delete(key)
      cache.set(key, cached)
      return cached.lines
    }
    if (requests >= MAX_REQUESTS_PER_LOADER) {
      return null
    }
    requests += 1
    const side = toAzureDevOpsReviewFileSide(
      await getAzureDevOpsReviewItemAtCommit(target, toAzureDevOpsItemPath(path), commit)
    )
    const readable = !side.missing && !side.binary && !side.tooLarge
    const entry = {
      lines: readable ? azureDevOpsReviewContentLines(side.content) : null,
      chars: side.content.length
    }
    remember(key, entry)
    return entry.lines
  }
}
