import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { durableWriteTempPath, writeFileDurableSync } from '../../durable-file-write'
import { gitExecFileAsync, promptGuardGitEnv } from '../../git/runner'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewWorktreeInfo,
  AzureDevOpsReviewWorktreeResult
} from '../../../shared/azure-devops-review-types'
import type { AzureDevOpsReviewRepoSource } from './azure-devops-review-repos'

const FETCH_TIMEOUT_MS = 120_000
const REVIEW_REMOTE = 'origin'

type RegistryEntry = AzureDevOpsReviewWorktreeInfo & { repoKey: string }
type Registry = { version: 1; worktrees: RegistryEntry[] }

/** Runtime capabilities the shared review worktree needs; injected so tests stay off the runtime. */
export type AzureDevOpsReviewWorktreeHost = {
  createWorktree: (args: {
    repoId: string
    name: string
    baseBranch: string
  }) => Promise<{ id: string; path: string; branch: string }>
  /** Null when the worktree no longer exists. */
  findWorktree: (worktreeId: string) => Promise<{ id: string; path: string } | null>
  updateWorktree: (
    worktreeId: string,
    updates: { baseRef: string; linkedAzureDevOpsPR: number; displayName: string }
  ) => Promise<void>
  isAgentWorking: (worktreeId: string) => Promise<boolean>
  git?: (args: string[], cwd: string, timeoutMs?: number) => Promise<string>
}

let registryCache: Registry | null = null
let registryPathOverride: string | null = null

function registryPath(): string {
  return registryPathOverride ?? join(homedir(), '.orca', 'azure-devops-review-worktrees.json')
}

/** @internal - tests point the registry at a temp file. */
export function _setAzureDevOpsReviewWorktreeRegistryPath(path: string | null): void {
  registryPathOverride = path
  registryCache = null
}

function loadRegistry(): Registry {
  if (registryCache) {
    return registryCache
  }
  let worktrees: RegistryEntry[] = []
  if (existsSync(registryPath())) {
    try {
      const parsed = JSON.parse(readFileSync(registryPath(), 'utf-8')) as Partial<Registry>
      worktrees = (Array.isArray(parsed.worktrees) ? parsed.worktrees : []).filter(
        (entry): entry is RegistryEntry =>
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

function saveRegistryEntry(entry: RegistryEntry): void {
  const worktrees = [...loadRegistry().worktrees.filter((e) => e.repoKey !== entry.repoKey), entry]
  registryCache = { version: 1, worktrees }
  mkdirSync(join(registryPath(), '..'), { recursive: true })
  writeFileDurableSync(
    durableWriteTempPath(registryPath()),
    registryPath(),
    JSON.stringify(registryCache, null, 2)
  )
}

function forgetRegistryEntry(repoKey: string): void {
  const registry = loadRegistry()
  if (!registry.worktrees.some((entry) => entry.repoKey === repoKey)) {
    return
  }
  registryCache = { version: 1, worktrees: registry.worktrees.filter((e) => e.repoKey !== repoKey) }
  writeFileDurableSync(
    durableWriteTempPath(registryPath()),
    registryPath(),
    JSON.stringify(registryCache, null, 2)
  )
}

export function findAzureDevOpsReviewWorktree(
  repoKey: string
): AzureDevOpsReviewWorktreeInfo | null {
  const entry = loadRegistry().worktrees.find((candidate) => candidate.repoKey === repoKey)
  if (!entry) {
    return null
  }
  return {
    worktreeId: entry.worktreeId,
    repoId: entry.repoId,
    path: entry.path,
    pullRequestKey: entry.pullRequestKey,
    commit: entry.commit
  }
}

async function defaultGit(args: string[], cwd: string, timeoutMs?: number): Promise<string> {
  const { stdout } = await gitExecFileAsync(args, {
    cwd,
    env: promptGuardGitEnv(process.env),
    useConfiguredSshCommandForNetwork: true,
    ...(timeoutMs ? { timeout: timeoutMs } : {})
  })
  return stdout
}

function reviewWorktreeName(repository: string): string {
  const slug = repository
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'repo'}-review`
}

async function commitExists(
  git: NonNullable<AzureDevOpsReviewWorktreeHost['git']>,
  cwd: string,
  commit: string
): Promise<boolean> {
  try {
    await git(['cat-file', '-e', `${commit}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

/** Fetches the PR branches and returns the commit to check out (the PR's, or the branch tip). */
async function fetchPullRequestCommit(
  git: NonNullable<AzureDevOpsReviewWorktreeHost['git']>,
  repoPath: string,
  pullRequest: AzureDevOpsReviewPullRequest
): Promise<string> {
  const sourceRef = `refs/remotes/${REVIEW_REMOTE}/${pullRequest.sourceBranch}`
  await git(
    [
      'fetch',
      '--no-tags',
      REVIEW_REMOTE,
      `+refs/heads/${pullRequest.sourceBranch}:${sourceRef}`,
      `+refs/heads/${pullRequest.targetBranch}:refs/remotes/${REVIEW_REMOTE}/${pullRequest.targetBranch}`
    ],
    repoPath,
    FETCH_TIMEOUT_MS
  )
  if (pullRequest.sourceCommit && (await commitExists(git, repoPath, pullRequest.sourceCommit))) {
    return pullRequest.sourceCommit
  }
  // Why: a push after the PR was read moves the branch past sourceCommit; review the tip then.
  return (await git(['rev-parse', `${sourceRef}^{commit}`], repoPath)).trim()
}

function failure(
  reason: Extract<AzureDevOpsReviewWorktreeResult, { ok: false }>['reason'],
  message: string
): AzureDevOpsReviewWorktreeResult {
  return { ok: false, reason, message }
}

/**
 * Opens a PR in the repo's shared review worktree, creating it on first use.
 * The worktree always sits on a detached HEAD at the PR commit, compared against the PR target.
 */
export async function openAzureDevOpsReviewWorktree(args: {
  host: AzureDevOpsReviewWorktreeHost
  source: AzureDevOpsReviewRepoSource
  pullRequest: AzureDevOpsReviewPullRequest
  discardChanges: boolean
}): Promise<AzureDevOpsReviewWorktreeResult> {
  const { host, source, pullRequest } = args
  const git = host.git ?? defaultGit
  if (pullRequest.isFork) {
    return failure('fork', 'Pull requests from forks are not supported for review.')
  }
  const repoPath = source.primaryRepo.path

  let commit: string
  try {
    commit = await fetchPullRequestCommit(git, repoPath, pullRequest)
  } catch (error) {
    return failure('git-failed', `Could not fetch the pull request branches: ${String(error)}`)
  }

  const registered = findAzureDevOpsReviewWorktree(source.key)
  let worktree = registered ? await host.findWorktree(registered.worktreeId) : null
  if (registered && !worktree) {
    forgetRegistryEntry(source.key)
  }
  let created = false

  if (worktree) {
    if (
      registered?.pullRequestKey !== pullRequest.key &&
      (await host.isAgentWorking(worktree.id))
    ) {
      return failure(
        'busy',
        'An agent is still working in the review workspace. Wait for it to finish before switching pull requests.'
      )
    }
    const status = await git(['status', '--porcelain'], worktree.path).catch(() => '')
    if (status.trim()) {
      if (!args.discardChanges) {
        return failure('dirty', 'The review workspace has uncommitted changes.')
      }
      try {
        await git(['reset', '--hard'], worktree.path)
        // Why no -x: ignored dependencies and build caches stay to make the next review fast.
        await git(['clean', '-fd'], worktree.path)
      } catch (error) {
        return failure('git-failed', `Could not discard changes: ${String(error)}`)
      }
    }
  } else {
    try {
      const createdWorktree = await host.createWorktree({
        repoId: source.primaryRepo.id,
        name: reviewWorktreeName(source.repository),
        baseBranch: `${REVIEW_REMOTE}/${pullRequest.targetBranch}`
      })
      worktree = { id: createdWorktree.id, path: createdWorktree.path }
      created = true
      await git(['checkout', '--detach', commit], worktree.path)
      // Why: the review worktree never sits on its scratch branch, so it must not linger.
      if (createdWorktree.branch) {
        await git(
          ['branch', '-D', createdWorktree.branch.replace(/^refs\/heads\//, '')],
          repoPath
        ).catch(() => undefined)
      }
    } catch (error) {
      return failure('git-failed', `Could not create the review workspace: ${String(error)}`)
    }
  }

  try {
    if (!created) {
      await git(['checkout', '--detach', commit], worktree.path)
    }
    await host.updateWorktree(worktree.id, {
      baseRef: `${REVIEW_REMOTE}/${pullRequest.targetBranch}`,
      linkedAzureDevOpsPR: pullRequest.pullRequestId,
      displayName: `Review !${pullRequest.pullRequestId} ${pullRequest.title}`.slice(0, 120)
    })
  } catch (error) {
    return failure('git-failed', `Could not switch the review workspace: ${String(error)}`)
  }

  const info: AzureDevOpsReviewWorktreeInfo = {
    worktreeId: worktree.id,
    repoId: source.primaryRepo.id,
    path: worktree.path,
    pullRequestKey: pullRequest.key,
    commit
  }
  saveRegistryEntry({ ...info, repoKey: source.key })
  return { ok: true, worktree: info, created }
}
