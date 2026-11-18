import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteMergedBranches, listMergedBranches } from './merged-branch-cleanup'

let template: string
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

function commitFile(name: string, content: string): void {
  writeFileSync(join(repo, name), content)
  git(repo, 'add', name)
  git(repo, 'commit', '-m', `add ${name}`)
}

/** A branch with one commit, pushed, then back on main. */
function pushedBranch(name: string): void {
  git(repo, 'checkout', '-b', name)
  commitFile(`${name.replace(/\//g, '-')}.txt`, name)
  git(repo, 'push', '-u', 'origin', name)
  git(repo, 'checkout', 'main')
}

function remoteBranches(): string[] {
  return git(join(root, 'origin.git'), 'for-each-ref', '--format=%(refname:short)', 'refs/heads')
    .split('\n')
    .sort()
}

function buildFixture(): void {
  git(root, 'init', '--bare', '--initial-branch=main', 'origin.git')
  git(root, 'init', '--initial-branch=main', 'repo')
  git(repo, 'remote', 'add', 'origin', join(root, 'origin.git'))
  commitFile('base.txt', 'base')
  git(repo, 'push', '-u', 'origin', 'main')
  git(repo, 'remote', 'set-head', 'origin', 'main')

  pushedBranch('merged')
  git(repo, 'merge', '--no-ff', 'merged', '-m', 'merge')
  pushedBranch('squashed')
  git(repo, 'merge', '--squash', 'squashed')
  git(repo, 'commit', '-m', 'squash')
  pushedBranch('open')
  pushedBranch('release/1.0')
  git(repo, 'merge', '--no-ff', 'release/1.0', '-m', 'merge release')
  git(repo, 'branch', 'fresh')
  git(repo, 'push', 'origin', 'main')
}

// Built once and copied: dozens of Git spawns per test make the file slow.
beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), 'orca-merged-branches-template-'))
  root = template
  repo = join(root, 'repo')
  buildFixture()
})

afterAll(() => {
  rmSync(template, { recursive: true, force: true })
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-merged-branches-'))
  repo = join(root, 'repo')
  cpSync(template, root, { recursive: true })
  git(repo, 'remote', 'set-url', 'origin', join(root, 'origin.git'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('merged branch cleanup', () => {
  it('lists branches merged or squashed into the remote default branch, and nothing else', async () => {
    const result = await listMergedBranches(repo)

    expect(result.targetRef).toBe('refs/remotes/origin/main')
    expect(result.targets).toEqual(['refs/remotes/origin/main', 'refs/remotes/origin/release/1.0'])
    expect(result.remoteFresh).toBe(true)
    expect(result.branches.map((branch) => [branch.name, branch.category])).toEqual([
      ['fresh', 'never-pushed'],
      ['merged', 'merged'],
      ['squashed', 'merged']
    ])
    expect(result.branches[1]).toMatchObject({
      upstreamGone: false,
      remote: { remote: 'origin', branch: 'merged', inSync: true }
    })
  })

  it('marks a merged branch a worktree has checked out and refuses to delete it', async () => {
    git(repo, 'worktree', 'add', join(root, 'other'), 'merged')

    const { branches } = await listMergedBranches(repo)
    const inWorkspace = branches.find((branch) => branch.name === 'merged')!
    const result = await deleteMergedBranches(repo, [{ name: 'merged', head: inWorkspace.head }])

    expect(inWorkspace).toMatchObject({ category: 'in-workspace' })
    expect(inWorkspace.worktreePath).toContain('other')
    expect(result.deleted).toEqual([])
  })

  it('notices a remote branch that was deleted since the last fetch', async () => {
    git(join(root, 'origin.git'), 'branch', '-D', 'merged')

    const { branches } = await listMergedBranches(repo)

    expect(branches.find((branch) => branch.name === 'merged')).toMatchObject({
      upstreamGone: true
    })
  })

  it('checks against another long-lived branch when asked, and rejects anything else', async () => {
    const result = await listMergedBranches(repo, { target: 'refs/remotes/origin/release/1.0' })

    expect(result.targetRef).toBe('refs/remotes/origin/release/1.0')
    expect(result.branches.map((branch) => branch.name)).toEqual(['fresh', 'merged', 'squashed'])
    await expect(listMergedBranches(repo, { target: 'refs/remotes/origin/open' })).rejects.toThrow(
      'can compare with'
    )
  })

  it('deletes locally, and on the remote only where asked', async () => {
    const { branches } = await listMergedBranches(repo)
    const result = await deleteMergedBranches(
      repo,
      branches
        .filter((branch) => branch.category === 'merged')
        .map((branch) => ({
          name: branch.name,
          head: branch.head,
          deleteRemote: branch.name === 'squashed'
        }))
    )

    expect(result).toEqual({
      deleted: ['merged', 'squashed'],
      remoteDeleted: ['squashed'],
      failures: []
    })
    expect(git(repo, 'branch', '--format=%(refname:short)').split('\n').sort()).toEqual([
      'fresh',
      'main',
      'open',
      'release/1.0'
    ])
    expect(remoteBranches()).toEqual(['main', 'merged', 'open', 'release/1.0'])
    expect(readFileSync(join(repo, '.git', 'orca-deleted-branches.log'), 'utf8')).toMatch(
      /^\S+\t[0-9a-f]{40}\tmerged\n\S+\t[0-9a-f]{40}\tsquashed\n$/
    )
  })

  it('refuses a branch that is not merged or moved since it was listed', async () => {
    const open = git(repo, 'rev-parse', 'open')
    const result = await deleteMergedBranches(repo, [
      { name: 'open', head: open, deleteRemote: true },
      { name: 'merged', head: open }
    ])

    expect(result.deleted).toEqual([])
    expect(result.failures.map((failure) => failure.name)).toEqual(['open', 'merged'])
    expect(remoteBranches()).toEqual(['main', 'merged', 'open', 'release/1.0', 'squashed'])
  })
})
