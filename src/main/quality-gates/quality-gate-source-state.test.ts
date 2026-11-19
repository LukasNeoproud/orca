import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readQualityGateSourceState } from './quality-gate-source-state'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null'
    }
  }).trim()
}

describe.skipIf(process.platform === 'win32')('readQualityGateSourceState', () => {
  let repo: string

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-source-')))
    git(repo, 'init', '--quiet')
    writeFileSync(join(repo, 'app.txt'), 'one\n')
    writeFileSync(join(repo, '.gitignore'), 'build/\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '--quiet', '-m', 'first')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  const read = () => readQualityGateSourceState({ path: repo, git: true })

  it('reports the commit and a clean tree', async () => {
    const state = await read()
    expect(state.head).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(state.clean).toBe(true)
    expect(state.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(await read()).toEqual(state)
  })

  it('changes the commit, not the fingerprint, after a commit that leaves the tree clean', async () => {
    const before = await read()
    writeFileSync(join(repo, 'app.txt'), 'two\n')
    git(repo, 'commit', '--quiet', '-am', 'second')

    const after = await read()
    expect(after.head).not.toBe(before.head)
    expect(after.clean).toBe(true)
    expect(after.fingerprint).toBe(before.fingerprint)
  })

  it('notices an edit, a new file, and a second edit of an already modified file', async () => {
    const clean = await read()
    writeFileSync(join(repo, 'app.txt'), 'edited\n')
    const edited = await read()
    expect(edited).toMatchObject({ head: clean.head, clean: false })
    expect(edited.fingerprint).not.toBe(clean.fingerprint)

    writeFileSync(join(repo, 'new.txt'), 'new\n')
    const added = await read()
    expect(added.fingerprint).not.toBe(edited.fingerprint)

    // Same status listing as before: only size and mtime tell the two apart.
    writeFileSync(join(repo, 'app.txt'), 'edited again\n')
    utimesSync(join(repo, 'app.txt'), new Date(), new Date(Date.now() + 5_000))
    expect((await read()).fingerprint).not.toBe(added.fingerprint)
  })

  it('gives many changed files the fingerprint a stored run was given for the same tree', async () => {
    for (let index = 0; index < 150; index++) {
      writeFileSync(join(repo, `changed-${index}.txt`), 'x'.repeat(index))
    }
    // The form stored runs carry: the listing, then path, size and mtime in listing order.
    const listing = execFileSync(
      'git',
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      { cwd: repo, encoding: 'utf-8' }
    )
    const expected = createHash('sha256').update(listing)
    for (const record of listing.split('\0').filter(Boolean)) {
      const path = record.slice(3)
      const stats = lstatSync(join(repo, path))
      expected.update(`\0${path}\0${stats.size}:${Math.round(stats.mtimeMs)}`)
    }

    const state = await read()
    expect(state.clean).toBe(false)
    expect(state.fingerprint).toBe(expected.digest('hex'))
  })

  it('ignores files git ignores, so build output does not make a result stale', async () => {
    const clean = await read()
    execFileSync('mkdir', ['-p', join(repo, 'build')])
    writeFileSync(join(repo, 'build', 'out.bin'), 'artifact')
    expect(await read()).toEqual(clean)
  })

  it('ties a folder workspace to no commit and runs no git for it', async () => {
    expect(await readQualityGateSourceState({ path: repo, git: false })).toEqual({
      head: null,
      clean: null,
      fingerprint: null
    })
  })

  it('reports an unreadable tree as unknown rather than clean', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-nogit-')))
    try {
      expect(await readQualityGateSourceState({ path: outside, git: true })).toEqual({
        head: null,
        clean: null,
        fingerprint: null
      })
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
