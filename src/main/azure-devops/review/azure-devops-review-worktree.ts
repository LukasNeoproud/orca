import { gitExecFileAsync, promptGuardGitEnv } from '../../git/runner'
import { readAzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-depth-execution'
import type { AzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-options'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewWorktreeInfo,
  AzureDevOpsReviewWorktreeResult
} from '../../../shared/azure-devops-review-types'
import {
  AZURE_DEVOPS_REVIEW_REMOTE as REVIEW_REMOTE,
  azureDevOpsReviewBaseRef,
  closedAzureDevOpsReviewCommits
} from '../../../shared/azure-devops-review-base-ref'
import type { AzureDevOpsReviewRepoSource } from './azure-devops-review-repos'
import {
  _setAzureDevOpsReviewWorktreeRegistryPathOnly as setRegistryPath,
  forgetAzureDevOpsReviewWorktreeEntry as forgetRegistryEntry,
  loadAzureDevOpsReviewWorktreeRegistry as loadRegistry,
  nextAzureDevOpsReviewWorktreeIndex as nextReviewWorktreeIndex,
  saveAzureDevOpsReviewWorktreeEntry as saveRegistryEntry
} from './azure-devops-review-worktree-registry'

export { findAzureDevOpsReviewWorktree } from './azure-devops-review-worktree-registry'

export const AZURE_DEVOPS_REVIEW_FETCH_TIMEOUT_MS = 120_000
const repoQueues = new Map<string, Promise<unknown>>()

/** Runtime capabilities the review worktrees need; injected so tests stay off the runtime. */
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
    updates: {
      baseRef: string
      linkedAzureDevOpsPR: number
      displayName: string
    }
  ) => Promise<void>
  git?: (args: string[], cwd: string, timeoutMs?: number) => Promise<string>
}

/** @internal - tests point the registry at a temp file. */
export function _setAzureDevOpsReviewWorktreeRegistryPath(path: string | null): void {
  setRegistryPath(path)
}

/** Git as review and feedback worktrees run it: no credential prompts, the configured SSH command. */
export async function azureDevOpsReviewGit(
  args: string[],
  cwd: string,
  timeoutMs?: number
): Promise<string> {
  const { stdout } = await gitExecFileAsync(args, {
    cwd,
    env: promptGuardGitEnv(process.env),
    useConfiguredSshCommandForNetwork: true,
    ...(timeoutMs ? { timeout: timeoutMs } : {})
  })
  return stdout
}

function reviewWorktreeName(repository: string, index: number): string {
  const slug = repository
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'repo'}-review${index > 1 ? `-${index}` : ''}`
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

/** Fetches the PR and returns the commit to check out (the PR's, or the branch tip). */
async function fetchPullRequestCommit(
  git: NonNullable<AzureDevOpsReviewWorktreeHost['git']>,
  repoPath: string,
  pullRequest: AzureDevOpsReviewPullRequest
): Promise<string> {
  const closed = closedAzureDevOpsReviewCommits(pullRequest)
  if (closed) {
    const missing: string[] = []
    for (const commit of [closed.source, closed.target]) {
      if (!(await commitExists(git, repoPath, commit))) {
        missing.push(commit)
      }
    }
    if (missing.length > 0) {
      // Why by commit: the branch is usually deleted, and a squash merge leaves its commits on no branch.
      await git(
        ['fetch', '--no-tags', REVIEW_REMOTE, ...missing],
        repoPath,
        AZURE_DEVOPS_REVIEW_FETCH_TIMEOUT_MS
      )
    }
    return closed.source
  }
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
    AZURE_DEVOPS_REVIEW_FETCH_TIMEOUT_MS
  )
  if (pullRequest.sourceCommit && (await commitExists(git, repoPath, pullRequest.sourceCommit))) {
    return pullRequest.sourceCommit
  }
  // Why: a push after the PR was read moves the branch past sourceCommit; review the tip then.
  return (await git(['rev-parse', `${sourceRef}^{commit}`], repoPath)).trim()
}

type PickedReviewWorktree = {
  worktree: { id: string; path: string }
  reviewIndex: number
  reviewDepth: AzureDevOpsReviewDepth | null
}

/**
 * The worktree that already has this PR checked out; null means the PR gets a new one.
 * Why never another PR's: its finished review and AI chat must stay where the user left them.
 * Forgets deleted worktrees on the way, so their names can be reused.
 */
async function pickReviewWorktree(
  host: AzureDevOpsReviewWorktreeHost,
  repoKey: string,
  pullRequestKey: string
): Promise<PickedReviewWorktree | null> {
  let picked: PickedReviewWorktree | null = null
  for (const entry of loadRegistry().worktrees.filter((e) => e.repoKey === repoKey)) {
    const worktree = await host.findWorktree(entry.worktreeId)
    if (!worktree) {
      forgetRegistryEntry(entry.worktreeId)
    } else if (!picked && entry.pullRequestKey === pullRequestKey) {
      picked = {
        worktree,
        reviewIndex: entry.reviewIndex ?? 1,
        reviewDepth: readAzureDevOpsReviewDepth(entry.reviewDepth)
      }
    }
  }
  return picked
}

function failure(
  reason: Extract<AzureDevOpsReviewWorktreeResult, { ok: false }>['reason'],
  message: string
): AzureDevOpsReviewWorktreeResult {
  return { ok: false, reason, message }
}

/**
 * Opens a PR in its own review worktree, creating one on first use, so reviews of different PRs
 * run side by side. A worktree always sits on a detached HEAD at the PR commit.
 */
export function openAzureDevOpsReviewWorktree(
  args: OpenReviewWorktreeArgs
): Promise<AzureDevOpsReviewWorktreeResult> {
  // Why serialized per repo: two reviews started together must not claim the same worktree name.
  const previous = repoQueues.get(args.source.key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => openReviewWorktree(args))
  repoQueues.set(args.source.key, next)
  void next.finally(() => {
    if (repoQueues.get(args.source.key) === next) {
      repoQueues.delete(args.source.key)
    }
  })
  return next
}

type OpenReviewWorktreeArgs = {
  host: AzureDevOpsReviewWorktreeHost
  source: AzureDevOpsReviewRepoSource
  pullRequest: AzureDevOpsReviewPullRequest
  discardChanges: boolean
  /** The depth the user just chose in an Orca app; undefined keeps what the worktree remembers. */
  depth?: AzureDevOpsReviewDepth
}

async function openReviewWorktree(
  args: OpenReviewWorktreeArgs
): Promise<AzureDevOpsReviewWorktreeResult> {
  const { host, source, pullRequest } = args
  const git = host.git ?? azureDevOpsReviewGit
  if (pullRequest.isFork) {
    return failure('fork', 'Pull requests from forks are not supported for review.')
  }
  const repoPath = source.primaryRepo.path

  let commit: string
  try {
    commit = await fetchPullRequestCommit(git, repoPath, pullRequest)
  } catch (error) {
    return failure(
      'git-failed',
      closedAzureDevOpsReviewCommits(pullRequest)
        ? `Could not fetch the pull request commits: ${String(error)}`
        : `Could not fetch the pull request branches: ${String(error)}`
    )
  }

  const picked = await pickReviewWorktree(host, source.key, pullRequest.key)
  if (picked) {
    const status = await git(['status', '--porcelain'], picked.worktree.path).catch(() => '')
    if (status.trim()) {
      if (!args.discardChanges) {
        return failure('dirty', 'The review workspace has uncommitted changes.')
      }
      try {
        await git(['reset', '--hard'], picked.worktree.path)
        // Why no -x: ignored dependencies and build caches stay to make the next review fast.
        await git(['clean', '-fd'], picked.worktree.path)
      } catch (error) {
        return failure('git-failed', `Could not discard changes: ${String(error)}`)
      }
    }
  }
  const created = !picked
  const reviewIndex = picked?.reviewIndex ?? nextReviewWorktreeIndex(source.key)
  let worktree: { id: string; path: string }
  if (picked) {
    worktree = picked.worktree
  } else {
    try {
      const createdWorktree = await host.createWorktree({
        repoId: source.primaryRepo.id,
        name: reviewWorktreeName(source.repository, reviewIndex),
        baseBranch: `${REVIEW_REMOTE}/${pullRequest.targetBranch}`
      })
      worktree = { id: createdWorktree.id, path: createdWorktree.path }
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
      baseRef: azureDevOpsReviewBaseRef(pullRequest),
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
    commit,
    reviewDepth: args.depth ?? picked?.reviewDepth ?? null
  }
  saveRegistryEntry({ ...info, repoKey: source.key, reviewIndex })
  return { ok: true, worktree: info, created }
}
