import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { loadGitBlameFromExecutor } from './git-blame'
import { loadGitLineHistoryFromExecutor } from './git-line-history'
import { resolveExecutableCommand } from './node-cli-command-resolution'

const repositories: string[] = []
const gitBinary = resolveExecutableCommand(process.env.ORCA_TEST_GIT_BINARY ?? 'git')
const FILE = 'src/recipe notes.txt'

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repo) => rm(repo, { recursive: true, force: true }))
  )
})

async function createRepository(commit = true) {
  if (!gitBinary) {
    throw new Error('Git is required for the real annotate regression')
  }
  const repo = await mkdtemp(join(tmpdir(), 'orca-annotate-'))
  repositories.push(repo)
  const emptyConfig = join(repo, 'empty-git-config')
  const emptyHooks = join(repo, 'empty-hooks')
  await writeFile(emptyConfig, '')
  await mkdir(emptyHooks)
  await mkdir(join(repo, 'src'))
  const fixtureEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
  const calls: string[][] = []
  const git = async (args: string[], cwd = repo, stdin?: string) => {
    calls.push(args)
    const result = await runProcess({
      program: gitBinary,
      args,
      cwd,
      input: stdin,
      env: { ...fixtureEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig },
      timeoutMs: 10000,
      maxOutputBytes: 1024 * 1024
    })
    if (result.code !== 0 || result.timedOut || result.outputTruncated) {
      throw Object.assign(new Error(`git ${args.join(' ')} failed: ${result.stderr}`), {
        stderr: result.stderr
      })
    }
    return { stdout: result.stdout }
  }
  const commitFile = async (lines: string[], author: string, day: number, subject: string) => {
    await writeFile(join(repo, FILE), `${lines.join('\n')}\n`)
    await git(['add', '--', FILE])
    const date = `2001-01-0${day}T00:00:00Z`
    await git([
      '-c',
      `user.name=${author}`,
      '-c',
      `user.email=${author.toLowerCase().replace(' ', '.')}@example.test`,
      'commit',
      '--quiet',
      `--date=${date}`,
      '-m',
      subject,
      '-m',
      `Body of ${subject}`
    ])
  }
  await git(['init', '--quiet'])
  await git(['config', 'commit.gpgsign', 'false'])
  await git(['config', 'core.hooksPath', emptyHooks])
  if (commit) {
    await commitFile(['flour', 'water', 'salt', 'yeast', 'rest'], 'Ada Baker', 1, 'Add the dough')
    await commitFile(
      ['flour', 'water', 'sea salt', 'yeast', 'rest'],
      'Bo Miller',
      2,
      'Use sea salt'
    )
    await commitFile(
      ['flour', 'water', 'sea salt', 'yeast', 'rest', 'bake'],
      'Ada Baker',
      3,
      'Bake it'
    )
  }
  return { repo, git, calls, commitFile }
}

describe('git blame against a real repository', () => {
  it('groups consecutive lines of one commit and marks edited lines as uncommitted', async () => {
    const { repo, git } = await createRepository()
    // Unsaved editor text: a new first line, an edited last line; the file on disk is untouched.
    const contents = ['oil', 'flour', 'water', 'sea salt', 'yeast', 'rest', 'bake hot'].join('\n')

    const blame = await loadGitBlameFromExecutor(git, repo, { relativePath: FILE, contents })

    expect(blame.status).toBe('ready')
    expect(blame.lineCount).toBe(7)
    const subjects = new Map(blame.commits.map((commit) => [commit.id, commit.subject]))
    expect(
      blame.ranges.map((range) => [
        range.startLine,
        range.lineCount,
        range.commitId ? subjects.get(range.commitId) : null
      ])
    ).toEqual([
      [1, 1, null],
      [2, 2, 'Add the dough'],
      [4, 1, 'Use sea salt'],
      [5, 2, 'Add the dough'],
      [7, 1, null]
    ])
    const seaSalt = blame.commits.find((commit) => commit.subject === 'Use sea salt')
    expect(seaSalt).toMatchObject({
      author: 'Bo Miller',
      authorEmail: 'bo.miller@example.test',
      timestamp: Date.parse('2001-01-02T00:00:00Z')
    })
    expect(seaSalt?.displayId).toBe(seaSalt?.id.slice(0, 7))
    expect(blame.commits).toHaveLength(2)
  })

  it('reports a path without a committed version instead of failing', async () => {
    const { repo, git } = await createRepository()
    await expect(
      loadGitBlameFromExecutor(git, repo, { relativePath: 'src/new.txt', contents: 'draft\n' })
    ).resolves.toEqual({ status: 'untracked', ranges: [], commits: [], lineCount: 0 })

    const empty = await createRepository(false)
    await expect(
      loadGitBlameFromExecutor(empty.git, empty.repo, { relativePath: FILE, contents: 'draft\n' })
    ).resolves.toMatchObject({ status: 'untracked' })
  })

  it('answers too-large without running Git and lets other failures through', async () => {
    const { repo, git, calls } = await createRepository()
    calls.length = 0
    const contents = 'x\n'.repeat(50_001)
    await expect(
      loadGitBlameFromExecutor(git, repo, { relativePath: FILE, contents })
    ).resolves.toMatchObject({ status: 'too-large' })
    expect(calls).toEqual([])

    await expect(
      loadGitBlameFromExecutor(git, tmpdir(), { relativePath: FILE, contents: 'a\n' })
    ).rejects.toThrow()
  })
})

describe('git line history against a real repository', () => {
  it('lists the commits that changed the block with their change to it', async () => {
    const { repo, git, calls } = await createRepository()
    calls.length = 0

    const history = await loadGitLineHistoryFromExecutor(git, repo, {
      relativePath: FILE,
      startLine: 2,
      endLine: 3
    })

    expect(history.status).toBe('ready')
    expect(history.headRange).toEqual({ startLine: 2, endLine: 3 })
    expect(history.items.map((item) => item.subject)).toEqual(['Use sea salt', 'Add the dough'])
    expect(history.items[0]).toMatchObject({
      author: 'Bo Miller',
      message: 'Use sea salt\n\nBody of Use sea salt',
      timestamp: Date.parse('2001-01-02T00:00:00Z'),
      parentIds: [history.items[1]!.id]
    })
    expect(history.items[0]!.patch).toBe('@@ -2,2 +2,2 @@\n water\n-salt\n+sea salt')
    expect(history.items[1]!.patch).toBe('@@ -0,0 +2,2 @@\n+water\n+salt')
    expect(history.items[1]!.parentIds).toEqual([])
    expect(history.hasMore).toBe(false)

    const log = calls.find((args) => args[0] === 'log')!
    const head = (await git(['rev-parse', 'HEAD'])).stdout.trim()
    // One file, a commit bound and a pinned revision: the Git Scan Safety contract.
    expect(log).toContain(`-L2,3:${FILE}`)
    expect(log).toContain('-n51')
    expect(log.at(-1)).toBe(head)
    expect(log).not.toContain('--all')
  })

  it('bounds the listing by the commit limit', async () => {
    const { repo, git } = await createRepository()
    const history = await loadGitLineHistoryFromExecutor(git, repo, {
      relativePath: FILE,
      startLine: 1,
      endLine: 6,
      limit: 2
    })
    expect(history.items.map((item) => item.subject)).toEqual(['Bake it', 'Use sea salt'])
    expect(history.hasMore).toBe(true)
    expect(history.limit).toBe(2)
  })

  it('maps working-tree lines to HEAD before asking for the history', async () => {
    const { repo, git } = await createRepository()
    // Two uncommitted lines above the block shift it down by two in the working tree.
    await writeFile(
      join(repo, FILE),
      ['oil', 'sugar', 'flour', 'water', 'sea salt', 'yeast', 'rest', 'bake', ''].join('\n')
    )

    const shifted = await loadGitLineHistoryFromExecutor(git, repo, {
      relativePath: FILE,
      startLine: 5,
      endLine: 5
    })
    expect(shifted.headRange).toEqual({ startLine: 3, endLine: 3 })
    expect(shifted.items.map((item) => item.subject)).toEqual(['Use sea salt', 'Add the dough'])

    await expect(
      loadGitLineHistoryFromExecutor(git, repo, { relativePath: FILE, startLine: 1, endLine: 2 })
    ).resolves.toMatchObject({ status: 'uncommitted', items: [] })
  })

  it('clamps a selection that runs past the committed end of the file', async () => {
    const { repo, git } = await createRepository()
    const history = await loadGitLineHistoryFromExecutor(git, repo, {
      relativePath: FILE,
      startLine: 6,
      endLine: 7
    })
    expect(history.status).toBe('ready')
    expect(history.items.map((item) => item.subject)).toEqual(['Bake it'])

    await expect(
      loadGitLineHistoryFromExecutor(git, repo, { relativePath: FILE, startLine: 40, endLine: 41 })
    ).resolves.toMatchObject({ status: 'uncommitted' })
  })

  it('reports an untracked path and an empty repository without failing', async () => {
    const { repo, git } = await createRepository()
    await writeFile(join(repo, 'src', 'new.txt'), 'draft\n')
    await expect(
      loadGitLineHistoryFromExecutor(git, repo, {
        relativePath: 'src/new.txt',
        startLine: 1,
        endLine: 1
      })
    ).resolves.toMatchObject({ status: 'untracked', items: [] })

    const empty = await createRepository(false)
    await expect(
      loadGitLineHistoryFromExecutor(empty.git, empty.repo, {
        relativePath: FILE,
        startLine: 1,
        endLine: 1
      })
    ).resolves.toMatchObject({ status: 'no-commits', items: [] })
  })
})
