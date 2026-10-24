import { gitExecFileAsync, promptGuardGitEnv } from '../../git/runner'
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
  saveAzureDevOpsReviewWorktreeEntry as saveRegistryEntry,
  type AzureDevOpsReviewWorktreeEntry as RegistryEntry
} from './azure-devops-review-worktree-registry'

export { findAzureDevOpsReviewWorktree } from './azure-devops-review-worktree-registry'

const FETCH_TIMEOUT_MS = 120_000
// Why: an agent reports "working" only seconds after launch; until then its worktree is spoken for.
const CLAIM_MS = 3 * 60_000

const claimedAt = new Map<string, number>()
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
  isAgentWorking: (worktreeId: string) => Promise<boolean>
  git?: (args: string[], cwd: string, timeoutMs?: number) => Promise<string>
}

/** @internal - tests point the registry at a temp file. */
export function _setAzureDevOpsReviewWorktreeRegistryPath(path: string | null): void {
  setRegistryPath(path)
  claimedAt.clear()
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
      await git(['fetch', '--no-tags', REVIEW_REMOTE, ...missing], repoPath, FETCH_TIMEOUT_MS)
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
    FETCH_TIMEOUT_MS
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
  samePullRequest: boolean
}

/**
 * The worktree a PR is reviewed in: the one already on it, else an idle one with nothing to lose.
 * Null means a new worktree is needed, so reviews of different PRs run side by side.
 */
async function pickReviewWorktree(
  host: AzureDevOpsReviewWorktreeHost,
  git: NonNullable<AzureDevOpsReviewWorktreeHost['git']>,
  repoKey: string,
  pullRequestKey: string
): Promise<PickedReviewWorktree | null> {
  const entries = loadRegistry().worktrees.filter((entry) => entry.repoKey === repoKey)
  const live: {
    entry: RegistryEntry
    worktree: { id: string; path: string }
  }[] = []
  for (const entry of entries) {
    const worktree = await host.findWorktree(entry.worktreeId)
    if (worktree) {
      live.push({ entry, worktree })
    } else {
      forgetRegistryEntry(entry.worktreeId)
    }
  }
  const same = live.find(({ entry }) => entry.pullRequestKey === pullRequestKey)
  if (same) {
    return {
      worktree: same.worktree,
      reviewIndex: same.entry.reviewIndex ?? 1,
      samePullRequest: true
    }
  }
  // Why oldest first: the most recent review is the one the user is likeliest to return to.
  for (const { entry, worktree } of live) {
    if (
      Date.now() - (claimedAt.get(worktree.id) ?? 0) < CLAIM_MS ||
      (await host.isAgentWorking(worktree.id))
    ) {
      continue
    }
    const status = await git(['status', '--porcelain'], worktree.path).catch(() => null)
    if (status !== null && !status.trim()) {
      return {
        worktree,
        reviewIndex: entry.reviewIndex ?? 1,
        samePullRequest: false
      }
    }
  }
  return null
}

function failure(
  reason: Extract<AzureDevOpsReviewWorktreeResult, { ok: false }>['reason'],
  message: string
): AzureDevOpsReviewWorktreeResult {
  return { ok: false, reason, message }
}

/**
 * Opens a PR in one of the repo's review worktrees, creating another while every existing one is
 * busy with a different PR. A worktree always sits on a detached HEAD at the PR commit.
 */
export function openAzureDevOpsReviewWorktree(
  args: OpenReviewWorktreeArgs
): Promise<AzureDevOpsReviewWorktreeResult> {
  // Why serialized per repo: two reviews started together must not pick the same idle worktree.
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
}

async function openReviewWorktree(
  args: OpenReviewWorktreeArgs
): Promise<AzureDevOpsReviewWorktreeResult> {
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
    return failure(
      'git-failed',
      closedAzureDevOpsReviewCommits(pullRequest)
        ? `Could not fetch the pull request commits: ${String(error)}`
        : `Could not fetch the pull request branches: ${String(error)}`
    )
  }

  const picked = await pickReviewWorktree(host, git, source.key, pullRequest.key)
  if (picked?.samePullRequest) {
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
    commit
  }
  saveRegistryEntry({ ...info, repoKey: source.key, reviewIndex })
  claimedAt.set(worktree.id, Date.now())
  return { ok: true, worktree: info, created }
}
