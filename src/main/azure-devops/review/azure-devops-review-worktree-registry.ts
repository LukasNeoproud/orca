import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { durableWriteTempPath, writeFileDurableSync } from '../../durable-file-write'
import { readAzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-depth-execution'
import type { AzureDevOpsReviewWorktreeInfo } from '../../../shared/azure-devops-review-types'

// Why reviewIndex: names each extra worktree of a repo (`-review-2`) so concurrent reviews never collide.
// `reviewDepth` is absent on an entry written before depths were remembered.
export type AzureDevOpsReviewWorktreeEntry = AzureDevOpsReviewWorktreeInfo & {
  repoKey: string
  reviewIndex?: number
}
type Registry = { version: 1; worktrees: AzureDevOpsReviewWorktreeEntry[] }

let registryCache: Registry | null = null
let registryPathOverride: string | null = null

function registryPath(): string {
  return registryPathOverride ?? join(homedir(), '.orca', 'azure-devops-review-worktrees.json')
}

/** @internal - tests point the registry at a temp file. */
export function _setAzureDevOpsReviewWorktreeRegistryPathOnly(path: string | null): void {
  registryPathOverride = path
  registryCache = null
}

export function loadAzureDevOpsReviewWorktreeRegistry(): Registry {
  if (registryCache) {
    return registryCache
  }
  let worktrees: AzureDevOpsReviewWorktreeEntry[] = []
  if (existsSync(registryPath())) {
    try {
      const parsed = JSON.parse(readFileSync(registryPath(), 'utf-8')) as Partial<Registry>
      worktrees = (Array.isArray(parsed.worktrees) ? parsed.worktrees : []).filter(
        (entry): entry is AzureDevOpsReviewWorktreeEntry =>
          typeof entry?.repoKey === 'string' &&
          typeof entry.worktreeId === 'string' &&
          typeof entry.repoId === 'string' &&
          typeof entry.path === 'string'
      )
    } catch {
      worktrees = []
    }
  }
  registryCache = { version: 1, worktrees }
  return registryCache
}

function writeRegistry(worktrees: AzureDevOpsReviewWorktreeEntry[]): void {
  registryCache = { version: 1, worktrees }
  mkdirSync(join(registryPath(), '..'), { recursive: true })
  writeFileDurableSync(
    durableWriteTempPath(registryPath()),
    registryPath(),
    JSON.stringify(registryCache, null, 2)
  )
}

export function saveAzureDevOpsReviewWorktreeEntry(entry: AzureDevOpsReviewWorktreeEntry): void {
  writeRegistry([
    ...loadAzureDevOpsReviewWorktreeRegistry().worktrees.filter(
      (e) => e.worktreeId !== entry.worktreeId
    ),
    entry
  ])
}

export function forgetAzureDevOpsReviewWorktreeEntry(worktreeId: string): void {
  const registry = loadAzureDevOpsReviewWorktreeRegistry()
  if (registry.worktrees.some((entry) => entry.worktreeId === worktreeId)) {
    writeRegistry(registry.worktrees.filter((e) => e.worktreeId !== worktreeId))
  }
}

function toInfo(entry: AzureDevOpsReviewWorktreeEntry): AzureDevOpsReviewWorktreeInfo {
  return {
    worktreeId: entry.worktreeId,
    repoId: entry.repoId,
    path: entry.path,
    pullRequestKey: entry.pullRequestKey,
    commit: entry.commit,
    reviewDepth: readAzureDevOpsReviewDepth(entry.reviewDepth)
  }
}

/** The review worktree with this id, as this host's registry holds it; null for any other worktree. */
export function findAzureDevOpsReviewWorktreeById(
  worktreeId: string
): AzureDevOpsReviewWorktreeInfo | null {
  const entry = loadAzureDevOpsReviewWorktreeRegistry().worktrees.find(
    (candidate) => candidate.worktreeId === worktreeId
  )
  return entry ? toInfo(entry) : null
}

/**
 * The repo's review worktree that has `pullRequestKey` checked out, else the most recently
 * switched one (null when the repo has none).
 */
export function findAzureDevOpsReviewWorktree(
  repoKey: string,
  pullRequestKey?: string
): AzureDevOpsReviewWorktreeInfo | null {
  const entries = loadAzureDevOpsReviewWorktreeRegistry().worktrees.filter(
    (candidate) => candidate.repoKey === repoKey
  )
  const entry =
    (pullRequestKey && entries.find((e) => e.pullRequestKey === pullRequestKey)) || entries.at(-1)
  return entry ? toInfo(entry) : null
}

export function nextAzureDevOpsReviewWorktreeIndex(repoKey: string): number {
  const used = new Set(
    loadAzureDevOpsReviewWorktreeRegistry()
      .worktrees.filter((entry) => entry.repoKey === repoKey)
      .map((entry) => entry.reviewIndex ?? 1)
  )
  let index = 1
  while (used.has(index)) {
    index++
  }
  return index
}
