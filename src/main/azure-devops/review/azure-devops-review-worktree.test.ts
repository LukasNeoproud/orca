import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setAzureDevOpsReviewWorktreeRegistryPath,
  findAzureDevOpsReviewWorktree,
  openAzureDevOpsReviewWorktree,
  type AzureDevOpsReviewWorktreeHost
} from './azure-devops-review-worktree'
import type { AzureDevOpsReviewRepoSource } from './azure-devops-review-repos'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

const source = {
  key: 'dev.azure.com/contoso/web/app',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'App',
  orcaRepoIds: ['repo-1'],
  primaryRepo: { id: 'repo-1', path: '/repos/app' },
  ref: {}
} as unknown as AzureDevOpsReviewRepoSource

function pullRequest(id: number, patch: Partial<AzureDevOpsReviewPullRequest> = {}) {
  return {
    key: `dev.azure.com/contoso+repo+${id}`,
    pullRequestId: id,
    title: `PR ${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    sourceCommit: `sha${id}`,
    isFork: false,
    ...patch
  } as AzureDevOpsReviewPullRequest
}

function makeHost(options: { status?: string; busy?: boolean; missing?: string[] } = {}) {
  const calls: string[][] = []
  const git = vi.fn(async (args: string[], cwd: string) => {
    calls.push([cwd, ...args])
    if (args[0] === 'status') {
      return options.status ?? ''
    }
    if (args[0] === 'rev-parse') {
      return 'tip\n'
    }
    return ''
  })
  const host: AzureDevOpsReviewWorktreeHost = {
    createWorktree: vi.fn(async ({ name }: { name: string }) => ({
      id: `wt-${/-(\d+)$/.exec(name)?.[1] ?? 1}`,
      path: `/wt/${name}`,
      branch: name
    })),
    findWorktree: vi.fn(async (id: string) => {
      const index = /^wt-(\d+)$/.exec(id)?.[1]
      if (!index || options.missing?.includes(id)) {
        return null
      }
      return {
        id,
        path: index === '1' ? '/wt/app-review' : `/wt/app-review-${index}`
      }
    }),
    updateWorktree: vi.fn(async () => undefined),
    isAgentWorking: vi.fn(async () => options.busy === true),
    git
  }
  return { host, calls }
}

describe('openAzureDevOpsReviewWorktree', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ado-review-'))
    _setAzureDevOpsReviewWorktreeRegistryPath(join(dir, 'registry.json'))
  })
  afterEach(() => {
    _setAzureDevOpsReviewWorktreeRegistryPath(null)
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses pull requests from forks', async () => {
    const { host } = makeHost()
    const result = await openAzureDevOpsReviewWorktree({
      host,
      source,
      pullRequest: pullRequest(1, { isFork: true }),
      discardChanges: false
    })
    expect(result).toMatchObject({ ok: false, reason: 'fork' })
  })

  it('creates the shared worktree detached at the PR commit and compares against the target', async () => {
    const { host, calls } = makeHost()
    const result = await openAzureDevOpsReviewWorktree({
      host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    expect(result).toMatchObject({
      ok: true,
      created: true,
      worktree: { worktreeId: 'wt-1', commit: 'sha1' }
    })
    expect(host.createWorktree).toHaveBeenCalledWith({
      repoId: 'repo-1',
      name: 'app-review',
      baseBranch: 'origin/main'
    })
    expect(calls).toContainEqual(['/wt/app-review', 'checkout', '--detach', 'sha1'])
    expect(calls).toContainEqual(['/repos/app', 'branch', '-D', 'app-review'])
    expect(host.updateWorktree).toHaveBeenCalledWith('wt-1', {
      baseRef: 'origin/main',
      linkedAzureDevOpsPR: 1,
      displayName: 'Review !1 PR 1'
    })
    expect(findAzureDevOpsReviewWorktree(source.key)).toMatchObject({
      worktreeId: 'wt-1',
      repoId: 'repo-1',
      pullRequestKey: pullRequest(1).key
    })
  })

  it('switches an idle, clean worktree to another pull request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    vi.setSystemTime(Date.now() + 4 * 60_000)
    const idle = makeHost()
    const result = await openAzureDevOpsReviewWorktree({
      host: idle.host,
      source,
      pullRequest: pullRequest(2),
      discardChanges: false
    })
    expect(result).toMatchObject({
      ok: true,
      created: false,
      worktree: { worktreeId: 'wt-1' }
    })
    expect(idle.host.createWorktree).not.toHaveBeenCalled()
    expect(idle.calls).toContainEqual(['/wt/app-review', 'checkout', '--detach', 'sha2'])
  })

  it('asks before discarding changes when reopening the same pull request', async () => {
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })

    const dirty = makeHost({ status: ' M src/a.ts\n' })
    expect(
      await openAzureDevOpsReviewWorktree({
        host: dirty.host,
        source,
        pullRequest: pullRequest(1),
        discardChanges: false
      })
    ).toMatchObject({ ok: false, reason: 'dirty' })

    const result = await openAzureDevOpsReviewWorktree({
      host: dirty.host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: true
    })
    expect(result).toMatchObject({ ok: true, created: false })
    expect(dirty.host.createWorktree).not.toHaveBeenCalled()
    expect(dirty.calls).toContainEqual(['/wt/app-review', 'reset', '--hard'])
    expect(dirty.calls).toContainEqual(['/wt/app-review', 'clean', '-fd'])
  })

  it('opens another worktree while an agent reviews a different pull request', async () => {
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    const busy = makeHost({ busy: true })
    const result = await openAzureDevOpsReviewWorktree({
      host: busy.host,
      source,
      pullRequest: pullRequest(2),
      discardChanges: false
    })
    expect(result).toMatchObject({
      ok: true,
      created: true,
      worktree: { worktreeId: 'wt-2' }
    })
    expect(busy.host.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app-review-2' })
    )
    expect(busy.calls).not.toContainEqual(['/wt/app-review', 'checkout', '--detach', 'sha2'])
    expect(findAzureDevOpsReviewWorktree(source.key, pullRequest(1).key)).toMatchObject({
      worktreeId: 'wt-1'
    })
    expect(findAzureDevOpsReviewWorktree(source.key, pullRequest(2).key)).toMatchObject({
      worktreeId: 'wt-2'
    })

    // Reopening a pull request returns to its own worktree even while others are busy.
    const again = await openAzureDevOpsReviewWorktree({
      host: makeHost({ busy: true }).host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    expect(again).toMatchObject({
      ok: true,
      created: false,
      worktree: { worktreeId: 'wt-1' }
    })
  })

  it('gives reviews started together their own worktrees before any agent reports', async () => {
    const { host } = makeHost()
    const [first, second] = await Promise.all([
      openAzureDevOpsReviewWorktree({
        host,
        source,
        pullRequest: pullRequest(1),
        discardChanges: false
      }),
      openAzureDevOpsReviewWorktree({
        host,
        source,
        pullRequest: pullRequest(2),
        discardChanges: false
      })
    ])
    expect(first).toMatchObject({ ok: true, worktree: { worktreeId: 'wt-1' } })
    expect(second).toMatchObject({
      ok: true,
      worktree: { worktreeId: 'wt-2' }
    })
  })

  it("never discards another pull request's changes to free a worktree", async () => {
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    const dirty = makeHost({ status: ' M src/a.ts\n' })
    const result = await openAzureDevOpsReviewWorktree({
      host: dirty.host,
      source,
      pullRequest: pullRequest(2),
      discardChanges: true
    })
    expect(result).toMatchObject({
      ok: true,
      created: true,
      worktree: { worktreeId: 'wt-2' }
    })
    expect(dirty.calls.some(([, command]) => command === 'reset')).toBe(false)
  })

  it('reuses the name of a review worktree that was deleted', async () => {
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    await openAzureDevOpsReviewWorktree({
      host: makeHost({ busy: true }).host,
      source,
      pullRequest: pullRequest(2),
      discardChanges: false
    })
    const gone = makeHost({ busy: true, missing: ['wt-1'] })
    await openAzureDevOpsReviewWorktree({
      host: gone.host,
      source,
      pullRequest: pullRequest(3),
      discardChanges: false
    })
    expect(gone.host.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app-review' })
    )
  })

  it('reviews the branch tip when the PR commit was not fetched', async () => {
    const { host } = makeHost()
    host.git = vi.fn(async (args: string[]) => {
      if (args[0] === 'cat-file') {
        throw new Error('missing')
      }
      return args[0] === 'rev-parse' ? 'tip\n' : ''
    })
    const result = await openAzureDevOpsReviewWorktree({
      host,
      source,
      pullRequest: pullRequest(3),
      discardChanges: false
    })
    expect(result).toMatchObject({ ok: true, worktree: { commit: 'tip' } })
  })

  it('reviews a completed PR at its last merge commits when its branch is gone', async () => {
    const { host, calls } = makeHost()
    const fetchedCommits = new Set<string>()
    host.git = vi.fn(async (args: string[], cwd: string) => {
      calls.push([cwd, ...args])
      if (args[0] === 'cat-file' && !fetchedCommits.has(args[2].replace('^{commit}', ''))) {
        throw new Error('missing')
      }
      if (args[0] === 'fetch') {
        args.slice(3).forEach((commit) => fetchedCommits.add(commit))
      }
      return ''
    })
    const result = await openAzureDevOpsReviewWorktree({
      host,
      source,
      pullRequest: pullRequest(4, {
        status: 'completed',
        targetCommit: 'target4'
      }),
      discardChanges: false
    })

    expect(result).toMatchObject({ ok: true, worktree: { commit: 'sha4' } })
    expect(calls).toContainEqual(['/repos/app', 'fetch', '--no-tags', 'origin', 'sha4', 'target4'])
    expect(calls.some((call) => call.some((arg) => arg.includes('refs/heads/feature/4')))).toBe(
      false
    )
    expect(calls).toContainEqual(['/wt/app-review', 'checkout', '--detach', 'sha4'])
    expect(host.updateWorktree).toHaveBeenCalledWith('wt-1', {
      baseRef: 'target4',
      linkedAzureDevOpsPR: 4,
      displayName: 'Review !4 PR 4'
    })
  })

  it("skips the fetch when a closed PR's commits are already local", async () => {
    const { host, calls } = makeHost()
    await openAzureDevOpsReviewWorktree({
      host,
      source,
      pullRequest: pullRequest(5, {
        status: 'abandoned',
        targetCommit: 'target5'
      }),
      discardChanges: false
    })
    expect(calls.some(([, command]) => command === 'fetch')).toBe(false)
  })
})
