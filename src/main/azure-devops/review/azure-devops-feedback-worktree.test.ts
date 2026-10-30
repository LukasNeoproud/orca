import { describe, expect, it, vi } from 'vitest'
import {
  openAzureDevOpsFeedbackWorktree,
  type AzureDevOpsFeedbackWorktreeHost
} from './azure-devops-feedback-worktree'

type FeedbackPullRequest = Parameters<typeof openAzureDevOpsFeedbackWorktree>[0]['pullRequest']

const source = {
  orcaRepoIds: ['repo-1', 'repo-2'],
  primaryRepo: { id: 'repo-1', path: '/repos/app' }
}

function pullRequest(patch: Partial<FeedbackPullRequest> = {}): FeedbackPullRequest {
  return {
    pullRequestId: 7,
    status: 'active',
    sourceBranch: 'feature/login',
    targetBranch: 'main',
    sourceCommit: 'sha7',
    targetCommit: 'base7',
    isFork: false,
    ...patch
  }
}

type ListedWorktree = Awaited<ReturnType<AzureDevOpsFeedbackWorktreeHost['listWorktrees']>>[number]

function makeHost(
  options: { worktrees?: ListedWorktree[]; localBranch?: boolean; fetchFails?: boolean } = {}
) {
  const git = vi.fn(async (args: string[]) => {
    if (args[0] === 'fetch' && options.fetchFails) {
      throw new Error('offline')
    }
    if (args[0] === 'for-each-ref') {
      return options.localBranch ? `${args[2]}\n` : ''
    }
    return ''
  })
  const host = {
    listWorktrees: vi.fn(async () => options.worktrees ?? []),
    createWorktree: vi.fn(async ({ name }: { name: string }) => ({
      id: 'wt-new',
      path: `/wt/${name}`
    })),
    linkPullRequest: vi.fn(async () => undefined),
    git
  } satisfies AzureDevOpsFeedbackWorktreeHost
  return { host, git }
}

const branchWorktree: ListedWorktree = {
  id: 'wt-mine',
  repoId: 'repo-2',
  path: '/wt/login',
  branch: 'refs/heads/feature/login',
  linkedAzureDevOpsPR: null
}

describe('openAzureDevOpsFeedbackWorktree', () => {
  it('refuses forks and closed pull requests without touching git', async () => {
    const { host, git } = makeHost()
    const fork = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest({ isFork: true })
    })
    const closed = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest({ status: 'completed' })
    })
    expect(fork).toMatchObject({ ok: false, reason: 'fork' })
    expect(closed).toMatchObject({ ok: false, reason: 'closed' })
    expect(git).not.toHaveBeenCalled()
  })

  it('reuses the worktree that has the source branch checked out in any clone', async () => {
    const { host, git } = makeHost({ worktrees: [branchWorktree] })
    const result = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest()
    })
    expect(result).toEqual({
      ok: true,
      worktree: {
        worktreeId: 'wt-mine',
        repoId: 'repo-2',
        path: '/wt/login',
        branch: 'feature/login'
      },
      created: false
    })
    expect(host.listWorktrees).toHaveBeenCalledWith(['repo-1', 'repo-2'])
    expect(host.linkPullRequest).toHaveBeenCalledWith('wt-mine', 7)
    expect(host.createWorktree).not.toHaveBeenCalled()
    // Never resets or checks out: the author's work lives there.
    expect(git.mock.calls.map(([args]) => args[0])).toEqual(['fetch'])
  })

  it('keeps a link the user set to another pull request', async () => {
    const { host } = makeHost({ worktrees: [{ ...branchWorktree, linkedAzureDevOpsPR: 3 }] })
    await openAzureDevOpsFeedbackWorktree({ host, source, pullRequest: pullRequest() })
    expect(host.linkPullRequest).not.toHaveBeenCalled()
  })

  it('still opens an existing branch workspace when the fetch fails', async () => {
    const { host } = makeHost({ worktrees: [branchWorktree], fetchFails: true })
    const result = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest()
    })
    expect(result).toMatchObject({ ok: true, created: false })
  })

  it('creates a workspace from the remote branch when there is no local one', async () => {
    const { host } = makeHost()
    const result = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest()
    })
    expect(host.createWorktree).toHaveBeenCalledWith({
      repoId: 'repo-1',
      name: 'feature-login',
      branch: 'feature/login',
      remoteRef: 'refs/remotes/origin/feature/login',
      baseRef: 'origin/main',
      pullRequestId: 7
    })
    expect(result).toEqual({
      ok: true,
      worktree: {
        worktreeId: 'wt-new',
        repoId: 'repo-1',
        path: '/wt/feature-login',
        branch: 'feature/login'
      },
      created: true
    })
  })

  it('checks out an existing local branch instead of recreating it', async () => {
    const { host } = makeHost({ localBranch: true })
    await openAzureDevOpsFeedbackWorktree({ host, source, pullRequest: pullRequest() })
    expect(host.createWorktree).toHaveBeenCalledWith(expect.objectContaining({ remoteRef: null }))
  })

  it('reports a failed fetch when it would have to create the workspace', async () => {
    const { host } = makeHost({ fetchFails: true })
    const result = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest()
    })
    expect(result).toMatchObject({ ok: false, reason: 'git-failed' })
    expect(host.createWorktree).not.toHaveBeenCalled()
  })

  it('reports a create failure, such as the branch being checked out outside Orca', async () => {
    const { host } = makeHost()
    host.createWorktree.mockRejectedValueOnce(
      new Error('Branch is already checked out at /elsewhere. Open that worktree instead.')
    )
    const result = await openAzureDevOpsFeedbackWorktree({
      host,
      source,
      pullRequest: pullRequest()
    })
    expect(result).toEqual({
      ok: false,
      reason: 'git-failed',
      message:
        'Could not open a workspace on feature/login: Branch is already checked out at /elsewhere. Open that worktree instead.'
    })
  })
})
