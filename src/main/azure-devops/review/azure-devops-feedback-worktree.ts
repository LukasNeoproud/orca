import type {
  AzureDevOpsFeedbackWorktreeResult,
  AzureDevOpsReviewPullRequest
} from '../../../shared/azure-devops-review-types'
import {
  AZURE_DEVOPS_REVIEW_REMOTE as REMOTE,
  azureDevOpsReviewBaseRef
} from '../../../shared/azure-devops-review-base-ref'
import type { AzureDevOpsReviewRepoSource } from './azure-devops-review-repos'
import { stripRefsHeads } from './azure-devops-review-mappers'
import {
  AZURE_DEVOPS_REVIEW_FETCH_TIMEOUT_MS,
  azureDevOpsReviewGit
} from './azure-devops-review-worktree'

/** Runtime capabilities the feedback worktree needs; injected so tests stay off the runtime. */
export type AzureDevOpsFeedbackWorktreeHost = {
  /** Orca worktrees of these projects, with the ref each has checked out (`refs/heads/…`). */
  listWorktrees: (repoIds: readonly string[]) => Promise<
    {
      id: string
      repoId: string
      path: string
      branch: string
      linkedAzureDevOpsPR: number | null
    }[]
  >
  /** Checks out `branch` in a new worktree; `remoteRef` set means the local branch is created from it. */
  createWorktree: (args: {
    repoId: string
    name: string
    branch: string
    remoteRef: string | null
    baseRef: string
    pullRequestId: number
  }) => Promise<{ id: string; path: string }>
  linkPullRequest: (worktreeId: string, pullRequestId: number) => Promise<void>
  git?: (args: string[], cwd: string, timeoutMs?: number) => Promise<string>
}

function failure(
  reason: Extract<AzureDevOpsFeedbackWorktreeResult, { ok: false }>['reason'],
  message: string
): AzureDevOpsFeedbackWorktreeResult {
  return { ok: false, reason, message }
}

function feedbackWorktreeName(branch: string): string {
  const slug = branch
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return slug || 'pull-request'
}

async function hasLocalBranch(
  git: NonNullable<AzureDevOpsFeedbackWorktreeHost['git']>,
  repoPath: string,
  branch: string
): Promise<boolean> {
  const ref = `refs/heads/${branch}`
  const stdout = await git(['for-each-ref', '--format=%(refname)', ref], repoPath)
  return stdout.split('\n').some((line) => line.trim() === ref)
}

/**
 * Opens the author's own workspace for a pull request: the Orca worktree that has its source
 * branch checked out, or a new one on that branch. Unlike a review worktree it is never reset or
 * detached, because the author's uncommitted work and commits live there.
 */
export async function openAzureDevOpsFeedbackWorktree(args: {
  host: AzureDevOpsFeedbackWorktreeHost
  source: Pick<AzureDevOpsReviewRepoSource, 'orcaRepoIds'> & {
    primaryRepo: Pick<AzureDevOpsReviewRepoSource['primaryRepo'], 'id' | 'path'>
  }
  pullRequest: Pick<
    AzureDevOpsReviewPullRequest,
    | 'pullRequestId'
    | 'isFork'
    | 'status'
    | 'sourceBranch'
    | 'targetBranch'
    | 'sourceCommit'
    | 'targetCommit'
  >
}): Promise<AzureDevOpsFeedbackWorktreeResult> {
  const { host, source, pullRequest } = args
  const git = host.git ?? azureDevOpsReviewGit
  if (pullRequest.isFork) {
    return failure('fork', 'Pull requests from forks are not supported.')
  }
  if (pullRequest.status !== 'active') {
    return failure('closed', 'The pull request is closed, so it takes no more changes.')
  }
  const branch = pullRequest.sourceBranch
  const remoteRef = `refs/remotes/${REMOTE}/${branch}`
  const repoPath = source.primaryRepo.path
  let fetchError: unknown = null
  try {
    // Why both: the agent compares against the target and checks whether the branch is behind.
    await git(
      [
        'fetch',
        '--no-tags',
        REMOTE,
        `+refs/heads/${branch}:${remoteRef}`,
        `+refs/heads/${pullRequest.targetBranch}:refs/remotes/${REMOTE}/${pullRequest.targetBranch}`
      ],
      repoPath,
      AZURE_DEVOPS_REVIEW_FETCH_TIMEOUT_MS
    )
  } catch (error) {
    fetchError = error
  }

  const existing = (await host.listWorktrees(source.orcaRepoIds)).find(
    (worktree) => stripRefsHeads(worktree.branch) === branch
  )
  if (existing) {
    // Why only when unlinked: the user may have linked this workspace to another pull request.
    if (existing.linkedAzureDevOpsPR == null) {
      await host.linkPullRequest(existing.id, pullRequest.pullRequestId).catch(() => undefined)
    }
    return {
      ok: true,
      worktree: { worktreeId: existing.id, repoId: existing.repoId, path: existing.path, branch },
      created: false
    }
  }
  if (fetchError) {
    return failure('git-failed', `Could not fetch the pull request branches: ${String(fetchError)}`)
  }
  try {
    const local = await hasLocalBranch(git, repoPath, branch)
    const created = await host.createWorktree({
      repoId: source.primaryRepo.id,
      name: feedbackWorktreeName(branch),
      branch,
      remoteRef: local ? null : remoteRef,
      baseRef: azureDevOpsReviewBaseRef(pullRequest),
      pullRequestId: pullRequest.pullRequestId
    })
    return {
      ok: true,
      worktree: {
        worktreeId: created.id,
        repoId: source.primaryRepo.id,
        path: created.path,
        branch
      },
      created: true
    }
  } catch (error) {
    return failure(
      'git-failed',
      `Could not open a workspace on ${branch}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
