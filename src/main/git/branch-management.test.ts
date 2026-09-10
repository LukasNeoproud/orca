import { listWorktrees } from './worktree'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitExecFileAsync } from './runner'
import { inspectManagedBranches, mutateManagedBranch } from './branch-management'

describe('explicit checkout branch management', () => {
  let root: string
  let repo: string
  const git = (args: string[]) => gitExecFileAsync(args, { cwd: repo })
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'orca-branch-management-'))
    repo = root
    await git(['init'])
    await git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial'
    ])
    await git(['branch', 'existing'])
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })
  const listing = () => listWorktrees(repo)
  const safe = async () => {}
  it('keeps local branch identity when a tag has the same name', async () => {
    await git(['tag', 'existing'])
    await mutateManagedBranch(git, 'switch', 'existing', repo, safe, listing)
    const state = await inspectManagedBranches(git, listing)
    expect(state.current).toBe('existing')
    expect(state.branches).toContain('existing')
  })
  it('switches without moving the checkout and supports detached HEAD recovery', async () => {
    await mutateManagedBranch(git, 'switch', 'existing', repo, safe, listing)
    expect((await inspectManagedBranches(git, listing)).current).toBe('existing')
    await git(['checkout', '--detach', 'HEAD'])
    await mutateManagedBranch(git, 'create', 'feature/from-detached', repo, safe, listing)
    expect((await inspectManagedBranches(git, listing)).current).toBe('feature/from-detached')
    await mutateManagedBranch(git, 'rename', 'feature/renamed', repo, safe, listing)
    expect((await inspectManagedBranches(git, listing)).current).toBe('feature/renamed')
  })
  it.each(['untracked', 'staged', 'unstaged'])(
    'preserves %s files and branch when switching is blocked',
    async (kind) => {
      if (kind === 'unstaged') {
        await writeFile(path.join(repo, 'file'), 'original')
        await git(['add', 'file'])
        await git([
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          'commit',
          '-m',
          'file'
        ])
      }
      const before = (await inspectManagedBranches(git, listing)).current
      await writeFile(path.join(repo, 'file'), 'keep me')
      if (kind === 'staged') {
        await git(['add', 'file'])
      }
      await expect(
        mutateManagedBranch(git, 'switch', 'existing', repo, safe, listing)
      ).rejects.toThrow('changes')
      expect(await readFile(path.join(repo, 'file'), 'utf8')).toBe('keep me')
      expect((await inspectManagedBranches(git, listing)).current).toBe(before)
    }
  )
  it('rejects occupied and missing branches without creating refs', async () => {
    const occupied = path.join(root, 'occupied')
    await git(['worktree', 'add', occupied, 'existing'])
    await expect(
      mutateManagedBranch(git, 'switch', 'existing', repo, safe, listing)
    ).rejects.toThrow(occupied)
    await expect(
      mutateManagedBranch(git, 'switch', 'missing', repo, safe, listing)
    ).rejects.toThrow('no longer exists')
    expect((await inspectManagedBranches(git, listing)).branches).not.toContain('missing')
  })
  it.each(['../bad', '--force', 'bad..name', 'HEAD'])(
    'rejects invalid explicit branch %s',
    async (branch) => {
      await expect(
        mutateManagedBranch(git, 'create', branch, repo, safe, listing)
      ).rejects.toThrow()
      expect((await inspectManagedBranches(git, listing)).branches).not.toContain(branch)
    }
  )
  it('never mutates when host agent or Git-operation safety fails', async () => {
    const before = await inspectManagedBranches(git, listing)
    await expect(
      mutateManagedBranch(
        git,
        'create',
        'new',
        repo,
        async () => {
          throw new Error('unverifiable')
        },
        listing
      )
    ).rejects.toThrow('unverifiable')
    expect(await inspectManagedBranches(git, listing)).toEqual(before)
  })
})
