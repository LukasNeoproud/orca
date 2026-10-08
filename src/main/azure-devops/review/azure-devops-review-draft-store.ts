import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { durableWriteTempPath, writeFileDurableSync } from '../../durable-file-write'
import type { AzureDevOpsReviewDraft } from '../../../shared/azure-devops-review-types'
import { normalizeAzureDevOpsReviewDraft } from './azure-devops-review-drafts'

type DraftFile = { version: 1; drafts: AzureDevOpsReviewDraft[] }

const PUBLISHED_RETENTION_MS = 30 * 24 * 60 * 60_000

let cached: DraftFile | null = null
let storePathOverride: string | null = null

function storePath(): string {
  return storePathOverride ?? join(homedir(), '.orca', 'azure-devops-review-drafts.json')
}

/** @internal - tests point the store at a temp file. */
export function _setAzureDevOpsReviewDraftStorePath(path: string | null): void {
  storePathOverride = path
  cached = null
}

function load(): DraftFile {
  if (cached) {
    return cached
  }
  let drafts: AzureDevOpsReviewDraft[] = []
  const path = storePath()
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<DraftFile>
      const cutoff = Date.now() - PUBLISHED_RETENTION_MS
      drafts = (Array.isArray(parsed.drafts) ? parsed.drafts : [])
        .map(normalizeAzureDevOpsReviewDraft)
        .filter((draft): draft is AzureDevOpsReviewDraft => draft !== null)
        // Why: published drafts only back the "published" badge; drop them after a while.
        .filter((draft) => draft.state !== 'published' || draft.updatedAt >= cutoff)
    } catch {
      drafts = []
    }
  }
  cached = { version: 1, drafts }
  return cached
}

function persist(drafts: AzureDevOpsReviewDraft[]): void {
  const path = storePath()
  mkdirSync(join(path, '..'), { recursive: true })
  cached = { version: 1, drafts }
  writeFileDurableSync(durableWriteTempPath(path), path, JSON.stringify(cached, null, 2))
}

export function listStoredAzureDevOpsReviewDrafts(
  pullRequestKey?: string
): AzureDevOpsReviewDraft[] {
  const drafts = load().drafts
  return pullRequestKey ? drafts.filter((draft) => draft.pullRequestKey === pullRequestKey) : drafts
}

export function getStoredAzureDevOpsReviewDraft(id: string): AzureDevOpsReviewDraft | null {
  return load().drafts.find((draft) => draft.id === id) ?? null
}

export function putStoredAzureDevOpsReviewDraft(draft: AzureDevOpsReviewDraft): void {
  const others = load().drafts.filter((existing) => existing.id !== draft.id)
  persist([...others, draft])
}

export function deleteStoredAzureDevOpsReviewDraft(id: string): boolean {
  const drafts = load().drafts
  const next = drafts.filter((draft) => draft.id !== id)
  if (next.length === drafts.length) {
    return false
  }
  persist(next)
  return true
}

export function countUnpublishedAzureDevOpsReviewDrafts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const draft of load().drafts) {
    if (draft.state !== 'published') {
      counts[draft.pullRequestKey] = (counts[draft.pullRequestKey] ?? 0) + 1
    }
  }
  return counts
}
