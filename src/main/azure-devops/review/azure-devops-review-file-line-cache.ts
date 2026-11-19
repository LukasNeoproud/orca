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

/** A file at a commit as far as it can be compared: `unreadable` is binary or too large. */
export type AzureDevOpsReviewFileAtCommit =
  | { state: 'text'; lines: readonly string[] }
  | { state: 'missing' }
  | { state: 'unreadable' }

type CachedFile = { file: AzureDevOpsReviewFileAtCommit; chars: number }

// A file at a commit never changes, so entries only leave to bound memory.
const cache = new Map<string, CachedFile>()
let cachedChars = 0

function remember(key: string, entry: CachedFile): void {
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

/** Reads a file at a commit; `null` once the reader has spent its requests. */
export type AzureDevOpsReviewFileReader = (
  path: string,
  commit: string
) => Promise<AzureDevOpsReviewFileAtCommit | null>

/** Reads file versions through the shared cache, with one request budget per reader. */
export function createAzureDevOpsReviewFileReader(
  target: AzureDevOpsReviewTarget & { repositoryId: string }
): AzureDevOpsReviewFileReader {
  let requests = 0
  return async (path, commit) => {
    const key = `${target.organizationKey}\n${target.repositoryId}\n${commit}\n${path}`
    const cached = cache.get(key)
    if (cached) {
      // Re-insert so the entry counts as recently used.
      cache.delete(key)
      cache.set(key, cached)
      return cached.file
    }
    if (requests >= MAX_REQUESTS_PER_LOADER) {
      return null
    }
    requests += 1
    const side = toAzureDevOpsReviewFileSide(
      await getAzureDevOpsReviewItemAtCommit(target, toAzureDevOpsItemPath(path), commit)
    )
    const file: AzureDevOpsReviewFileAtCommit = side.missing
      ? { state: 'missing' }
      : side.binary || side.tooLarge
        ? { state: 'unreadable' }
        : { state: 'text', lines: azureDevOpsReviewContentLines(side.content) }
    remember(key, { file, chars: side.content.length })
    return file
  }
}

/** A reader's files as thread tracking wants them: a version it cannot compare is null. */
export function toAzureDevOpsReviewLineLoader(
  read: AzureDevOpsReviewFileReader
): AzureDevOpsReviewLineLoader {
  return async (path, commit) => {
    const file = await read(path, commit)
    return file?.state === 'text' ? file.lines : null
  }
}

/** Reads file versions for thread tracking; a version it cannot compare resolves to null. */
export function createAzureDevOpsReviewLineLoader(
  target: AzureDevOpsReviewTarget & { repositoryId: string }
): AzureDevOpsReviewLineLoader {
  return toAzureDevOpsReviewLineLoader(createAzureDevOpsReviewFileReader(target))
}
