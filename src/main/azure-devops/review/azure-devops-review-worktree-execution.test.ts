import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'
import type { AzureDevOpsReviewRepoSource } from './azure-devops-review-repos'
import {
  _setAzureDevOpsReviewWorktreeRegistryPath,
  findAzureDevOpsReviewWorktree,
  openAzureDevOpsReviewWorktree,
  type AzureDevOpsReviewWorktreeHost
} from './azure-devops-review-worktree'
import {
  assertAzureDevOpsReviewDepthCaller,
  azureDevOpsReviewWorktreeExecution,
  refuseAzureDevOpsReviewWorktreeExecution
} from './azure-devops-review-worktree-execution'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: opening a worktree reads only the key, the repository name and the primary repo.
const source = {
  key: 'dev.azure.com/contoso/web/app',
  repository: 'App',
  primaryRepo: { id: 'repo-1', path: '/repos/app' }
} as unknown as AzureDevOpsReviewRepoSource

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: opening a worktree reads only the fields given here.
const pullRequest = {
  key: 'dev.azure.com/contoso+repo+7',
  pullRequestId: 7,
  title: 'PR 7',
  sourceBranch: 'feature/7',
  targetBranch: 'main',
  sourceCommit: 'sha7',
  isFork: false
} as AzureDevOpsReviewPullRequest

const host: AzureDevOpsReviewWorktreeHost = {
  createWorktree: async ({ name }) => ({ id: 'wt-1', path: `/wt/${name}`, branch: name }),
  findWorktree: async (id) => (id === 'wt-1' ? { id, path: '/wt/app-review' } : null),
  updateWorktree: async () => undefined,
  git: async () => ''
}

describe('running code in a review worktree', () => {
  let dir: string
  let registryFile: string

  const open = (depth?: 'static' | 'build' | 'build-and-test') =>
    openAzureDevOpsReviewWorktree({ host, source, pullRequest, discardChanges: false, depth })

  /** A registry file as another build left it; the cache is dropped as on a fresh start. */
  function writeRegistry(worktrees: Record<string, unknown>[]): void {
    writeFileSync(registryFile, JSON.stringify({ version: 1, worktrees }))
    _setAzureDevOpsReviewWorktreeRegistryPath(registryFile)
  }

  const entry = (extra: Record<string, unknown> = {}) => ({
    repoKey: source.key,
    worktreeId: 'wt-1',
    repoId: 'repo-1',
    path: '/wt/app-review',
    pullRequestKey: pullRequest.key,
    commit: 'sha7',
    reviewIndex: 1,
    ...extra
  })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-review-depth-'))
    registryFile = join(dir, 'review-worktrees.json')
    _setAzureDevOpsReviewWorktreeRegistryPath(registryFile)
  })

  afterEach(() => {
    _setAzureDevOpsReviewWorktreeRegistryPath(null)
    rmSync(dir, { recursive: true, force: true })
  })

  it('leaves a worktree that is no review worktree alone', () => {
    writeRegistry([entry({ reviewDepth: 'static' })])
    expect(azureDevOpsReviewWorktreeExecution('repo-1::/work/feature')).toEqual({
      reviewWorktree: false,
      allowed: true
    })
    expect(refuseAzureDevOpsReviewWorktreeExecution('repo-1::/work/feature')).toBeNull()
  })

  it('refuses a static review and says how to change the depth', async () => {
    await open('static')
    const execution = azureDevOpsReviewWorktreeExecution('wt-1')
    expect(execution).toMatchObject({ reviewWorktree: true, allowed: false, depth: 'static' })
    const message = refuseAzureDevOpsReviewWorktreeExecution('wt-1')
    expect(message).toContain('the review of this pull request is static')
    expect(message).toContain('start a new AI review')
    expect(message).toContain('Build or Build and run tests')
  })

  it.each(['build', 'build-and-test'] as const)('allows a review at depth %s', async (depth) => {
    await open(depth)
    expect(azureDevOpsReviewWorktreeExecution('wt-1')).toEqual({
      reviewWorktree: true,
      allowed: true,
      depth
    })
    expect(findAzureDevOpsReviewWorktree(source.key, pullRequest.key)?.reviewDepth).toBe(depth)
  })

  it('keeps the remembered depth when the worktree is opened again without one', async () => {
    await open('build')
    await open()
    expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({
      allowed: true,
      depth: 'build'
    })
  })

  it("replaces the depth with the user's next choice, down as well as up", async () => {
    await open('build-and-test')
    await open('static')
    expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({ allowed: false })
    await open('build')
    expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({ allowed: true })
  })

  it('remembers no depth for a worktree nobody chose one for', async () => {
    const opened = await open()
    expect(opened).toMatchObject({ ok: true, worktree: { reviewDepth: null } })
    expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({
      allowed: false,
      depth: null
    })
  })

  it('writes the depth into the registry file of this host', async () => {
    await open('build')
    const stored: unknown = JSON.parse(readFileSync(registryFile, 'utf-8'))
    expect(stored).toMatchObject({ worktrees: [{ worktreeId: 'wt-1', reviewDepth: 'build' }] })
  })

  describe('registry files of other builds', () => {
    it('treats a review worktree from a build before depths as static, and says so', () => {
      writeRegistry([entry()])
      const execution = azureDevOpsReviewWorktreeExecution('wt-1')
      expect(execution).toMatchObject({ reviewWorktree: true, allowed: false, depth: null })
      const message = refuseAzureDevOpsReviewWorktreeExecution('wt-1')
      expect(message).toContain('no review depth was chosen')
      expect(message).toContain('Build or Build and run tests')
    })

    it('still lists and reopens such a worktree, and then remembers the chosen depth', async () => {
      writeRegistry([entry()])
      expect(findAzureDevOpsReviewWorktree(source.key, pullRequest.key)).toMatchObject({
        worktreeId: 'wt-1',
        reviewDepth: null
      })
      await expect(open('build')).resolves.toMatchObject({ ok: true, created: false })
      expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({ allowed: true })
    })

    it('grants nothing for a depth this build does not know', () => {
      writeRegistry([entry({ reviewDepth: 'run-app' })])
      expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({
        allowed: false,
        depth: null
      })
    })

    it('reads as static after an older build rewrote the entry without the depth', () => {
      // The build before depths saved `{ ...info, repoKey, reviewIndex }` and dropped the rest.
      writeRegistry([entry({ reviewDepth: 'build' })])
      expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({ allowed: true })
      writeRegistry([entry()])
      expect(azureDevOpsReviewWorktreeExecution('wt-1')).toMatchObject({ allowed: false })
    })
  })

  describe('who may choose the depth', () => {
    it.each([{ kind: 'desktop' }, { kind: 'paired-device', deviceId: 'phone-1' }])(
      'takes it from $kind',
      (caller) => {
        expect(() => assertAzureDevOpsReviewDepthCaller(caller)).not.toThrow()
      }
    )

    it.each([[{ kind: 'local-cli' }], [undefined]])('refuses it from %o', (caller) => {
      expect(() => assertAzureDevOpsReviewDepthCaller(caller)).toThrow('only in the Orca app')
    })
  })
})
