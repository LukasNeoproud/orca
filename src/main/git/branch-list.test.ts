import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteBranch, listBranches, renameBranch } from './branch-list'

let root: string
let repo: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1'
    }
  }).trim()
}

function commitFile(name: string): void {
  writeFileSync(join(repo, name), name)
  git(repo, 'add', name)
  git(repo, 'commit', '-m', `add ${name}`)
}

function remoteBranches(): string[] {
  return git(join(root, 'origin.git'), 'for-each-ref', '--format=%(refname:short)', 'refs/heads')
    .split('\n')
    .sort()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-branch-list-'))
  repo = join(root, 'repo')
  git(root, 'init', '--bare', '--initial-branch=main', 'origin.git')
  git(root, 'init', '--initial-branch=main', 'repo')
  git(repo, 'remote', 'add', 'origin', join(root, 'origin.git'))
  commitFile('base.txt')
  git(repo, 'push', '-u', 'origin', 'main')
  git(repo, 'checkout', '-b', 'feature/pushed')
  commitFile('pushed.txt')
  git(repo, 'push', '-u', 'origin', 'feature/pushed')
  commitFile('ahead.txt')
  git(repo, 'checkout', 'main')
  git(repo, 'branch', 'local-only')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('branch list', () => {
  it('lists local and remote branches with tracking state', async () => {
    const { branches } = await listBranches(repo)

    expect(branches.map((branch) => `${branch.kind}:${branch.name}`)).toEqual([
      'local:feature/pushed',
      'local:local-only',
      'local:main',
      'remote:origin/feature/pushed',
      'remote:origin/main'
    ])
    expect(branches[0]).toMatchObject({
      subject: 'add ahead.txt',
      current: false,
      protected: false,
      upstream: { name: 'origin/feature/pushed', ahead: 1, behind: 0, gone: false }
    })
    expect(branches[2]).toMatchObject({ current: true, protected: true })
    expect(branches[2]!.worktreePath).toBeTruthy()
  })

  it('deletes an unmerged local branch at the commit it was shown', async () => {
    const head = git(repo, 'rev-parse', 'feature/pushed')

    await expect(
      deleteBranch(repo, { kind: 'local', name: 'feature/pushed', head: 'a'.repeat(40) })
    ).rejects.toThrow('changed')
    // The remote branch is one commit behind, so it stays even when asked for.
    const result = await deleteBranch(repo, {
      kind: 'local',
      name: 'feature/pushed',
      head,
      deleteRemote: true
    })

    expect(result).toEqual({ remoteDeleted: false })
    expect(git(repo, 'branch', '--list', 'feature/pushed')).toBe('')
    expect(remoteBranches()).toEqual(['feature/pushed', 'main'])
  })

  it('deletes a remote branch, and refuses long-lived and checked-out ones', async () => {
    const { branches } = await listBranches(repo)
    const find = (name: string) => branches.find((branch) => branch.name === name)!

    await deleteBranch(repo, {
      kind: 'remote',
      name: 'origin/feature/pushed',
      head: find('origin/feature/pushed').head
    })
    expect(remoteBranches()).toEqual(['main'])
    await expect(
      deleteBranch(repo, { kind: 'remote', name: 'origin/main', head: find('origin/main').head })
    ).rejects.toThrow('long-lived')
    git(repo, 'worktree', 'add', join(root, 'other'), 'local-only')
    await expect(
      deleteBranch(repo, { kind: 'local', name: 'local-only', head: find('local-only').head })
    ).rejects.toThrow('checked out')
  })

  it('renames a branch without overwriting another', async () => {
    await renameBranch(repo, 'local-only', 'renamed')

    expect(git(repo, 'branch', '--list', 'renamed')).toContain('renamed')
    await expect(renameBranch(repo, 'renamed', 'feature/pushed')).rejects.toThrow()
    await expect(renameBranch(repo, 'renamed', 'bad..name')).rejects.toThrow('not a valid')
    await expect(renameBranch(repo, 'main', 'other')).rejects.toThrow('long-lived')
  })
})
