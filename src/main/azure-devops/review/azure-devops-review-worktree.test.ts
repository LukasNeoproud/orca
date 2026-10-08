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

function makeHost(options: { status?: string; busy?: boolean } = {}) {
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
    createWorktree: vi.fn(async () => ({
      id: 'wt-1',
      path: '/wt/app-review',
      branch: 'app-review'
    })),
    findWorktree: vi.fn(async (id: string) =>
      id === 'wt-1' ? { id, path: '/wt/app-review' } : null
    ),
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

  it('switches the existing worktree, asking before discarding changes', async () => {
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
        pullRequest: pullRequest(2),
        discardChanges: false
      })
    ).toMatchObject({ ok: false, reason: 'dirty' })

    const result = await openAzureDevOpsReviewWorktree({
      host: dirty.host,
      source,
      pullRequest: pullRequest(2),
      discardChanges: true
    })
    expect(result).toMatchObject({ ok: true, created: false })
    expect(dirty.host.createWorktree).not.toHaveBeenCalled()
    expect(dirty.calls).toContainEqual(['/wt/app-review', 'reset', '--hard'])
    expect(dirty.calls).toContainEqual(['/wt/app-review', 'clean', '-fd'])
    expect(dirty.calls).toContainEqual(['/wt/app-review', 'checkout', '--detach', 'sha2'])
  })

  it('will not switch away while an agent is working', async () => {
    await openAzureDevOpsReviewWorktree({
      host: makeHost().host,
      source,
      pullRequest: pullRequest(1),
      discardChanges: false
    })
    const busy = makeHost({ busy: true })
    expect(
      await openAzureDevOpsReviewWorktree({
        host: busy.host,
        source,
        pullRequest: pullRequest(2),
        discardChanges: false
      })
    ).toMatchObject({ ok: false, reason: 'busy' })
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
})
