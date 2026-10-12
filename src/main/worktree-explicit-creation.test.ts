import { reserveWorktreeCreationDestination } from './worktree-creation-destination'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, lstat, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import {
  previewExplicitWorktreeCreation,
  assertExplicitCreationAvailable,
  explicitCreationTrackingTarget,
  validateExplicitDirectory
} from './worktree-explicit-creation'
import type { ExplicitCreationHost } from './worktree-explicit-creation'

let root: string
let host: ExplicitCreationHost
const request = (name = 'feature/123-add-something', layout = name) => ({
  branch: { kind: 'new' as const, name },
  destination: { root: '.worktrees', relativeDirectory: layout }
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-explicit-create-'))
  const exec = async (args: string[]) => {
    const result = await runProcess({ program: 'git', args, cwd: root })
    if (result.code !== 0) {
      throw Object.assign(new Error(result.stderr), { code: result.code })
    }
    return result
  }
  await exec(['init'])
  await exec(['symbolic-ref', 'HEAD', 'refs/heads/master'])
  await exec([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'initial'
  ])
  host = {
    repoPath: root,
    exec,
    defaultBase: async () => 'refs/heads/master',
    defaultPath: (directory) => join(root, 'default', directory),
    worktrees: async () => [{ path: root, branch: 'master' }],
    exists: async (path) =>
      lstat(path).then(
        () => true,
        () => false
      )
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('explicit worktree creation preflight', () => {
  it('preserves slash branch names and nested paths and prefers local master', async () => {
    const result = await previewExplicitWorktreeCreation(request(), undefined, host)
    expect(result.path).toBe(join(root, '.worktrees', 'feature', '123-add-something'))
    expect(result.baseBranch).toBe('refs/heads/master')
    expect(result.branch.name).toBe('feature/123-add-something')
    expect(result.needsLocalIgnore).toBe(true)
    assertExplicitCreationAvailable(result)
    await host.exec(['worktree', 'add', '-b', result.branch.name, result.path, result.baseBranch])
    expect(await host.exists(join(result.path, '.git'))).toBe(true)
  })
  it('supports flat directories without changing the logical branch', async () => {
    const result = await previewExplicitWorktreeCreation(
      request('feature/test', 'feature-test'),
      undefined,
      host
    )
    expect(result.path).toBe(join(root, '.worktrees', 'feature-test'))
    expect(result.branch.name).toBe('feature/test')
  })
  it('resolves exact local matches and reports the main checkout occupant', async () => {
    const result = await previewExplicitWorktreeCreation(request('master'), undefined, host)
    expect(result.branch.kind).toBe('local')
    expect(result.occupyingWorktree?.path).toBe(root)
    expect(() => assertExplicitCreationAvailable(result)).toThrow('already checked out')
  })
  it('rejects stale configured bases and occupied destinations without changing refs', async () => {
    await expect(
      previewExplicitWorktreeCreation(request(), undefined, { ...host, configuredBase: 'missing' })
    ).rejects.toThrow()
    await mkdir(join(root, '.worktrees', 'feature'), { recursive: true })
    await writeFile(join(root, '.worktrees', 'feature', '123-add-something'), 'keep')
    const result = await previewExplicitWorktreeCreation(request(), undefined, host)
    expect(() => assertExplicitCreationAvailable(result)).toThrow('Destination already exists')
    expect((await host.exec(['branch', '--list', 'feature/*'])).stdout).toBe('')
  })
  it('requires explicit remote selection and refuses to reset a local tracking branch', async () => {
    await host.exec(['remote', 'add', 'origin', root])
    await host.exec(['update-ref', 'refs/remotes/origin/topic', 'HEAD'])
    const explicit = {
      ...request('topic'),
      branch: { kind: 'remote' as const, name: 'topic', remoteRef: 'origin/topic' }
    }
    expect((await previewExplicitWorktreeCreation(explicit, undefined, host)).baseBranch).toBe(
      'refs/remotes/origin/topic'
    )
    await host.exec(['branch', 'topic'])
    await expect(previewExplicitWorktreeCreation(explicit, undefined, host)).rejects.toThrow(
      'local branch with this name'
    )
  })
  it('honors local ignore rules and the default location calculation', async () => {
    await writeFile(join(root, '.git', 'info', 'exclude'), '.worktrees/\n')
    expect(
      (await previewExplicitWorktreeCreation(request(), undefined, host)).needsLocalIgnore
    ).toBe(false)
    const explicit = request()
    const result = await previewExplicitWorktreeCreation(
      { ...explicit, destination: { relativeDirectory: 'topic' } },
      undefined,
      host
    )
    expect(result.path).toBe(join(root, 'default', 'topic'))
  })
  it.each([
    '../escape',
    'a/../escape',
    '/absolute',
    'a//b',
    'a\\b',
    'CON',
    'x/NUL.txt',
    'a/.git',
    'bad.',
    'bad?'
  ])('rejects unsafe directory %s', (value) => {
    expect(() => validateExplicitDirectory(value)).toThrow()
  })
})

it('reserves destinations exclusively and never removes a competing empty directory', async () => {
  const destination = join(root, 'nested', 'topic')
  const cleanup = await reserveWorktreeCreationDestination(destination)
  await expect(reserveWorktreeCreationDestination(destination)).rejects.toThrow()
  await cleanup()
  expect(await host.exists(destination)).toBe(false)
  await mkdir(destination)
  await expect(reserveWorktreeCreationDestination(destination)).rejects.toThrow()
  expect(await host.exists(destination)).toBe(true)
})

it('rejects a branch that appeared between preview and submission', async () => {
  const explicit = request('topic')
  await previewExplicitWorktreeCreation(explicit, undefined, host)
  await host.exec(['branch', 'topic'])
  await expect(previewExplicitWorktreeCreation(explicit, undefined, host, true)).rejects.toThrow(
    'now exists'
  )
})

it('chooses an exact local base when a same-name tag exists', async () => {
  await host.exec(['tag', 'master'])
  const result = await previewExplicitWorktreeCreation(request(), 'master', host)
  expect(result.baseBranch).toBe('refs/heads/master')
})

it('matches a directory-only local exclude before the destination exists', async () => {
  const explicit = request('topic')
  expect((await previewExplicitWorktreeCreation(explicit, undefined, host)).needsLocalIgnore).toBe(
    true
  )
  await writeFile(join(root, '.git', 'info', 'exclude'), '/.worktrees/topic/\n')
  const preview = await previewExplicitWorktreeCreation(explicit, undefined, host)
  expect(preview.destinationExists).toBe(false)
  expect(preview.needsLocalIgnore).toBe(false)
})

it('normalizes Windows directory probes before passing them to the execution host', async () => {
  const probes: string[] = []
  await previewExplicitWorktreeCreation(request('topic'), undefined, {
    ...host,
    worktrees: async () => [{ path: 'C:\\repo', branch: 'master' }],
    isIgnored: async (relative) => {
      probes.push(relative)
      return true
    }
  })
  expect(probes).toEqual(['.worktrees/topic/'])
})

it('preserves the longest configured remote prefix in the creation push target', async () => {
  await host.exec(['remote', 'add', 'foo', root])
  // Newer Git refuses to add a nested remote name, but configs written earlier still carry one.
  await host.exec(['config', 'remote.foo/bar.url', root])
  await host.exec(['config', 'remote.foo/bar.fetch', '+refs/heads/*:refs/remotes/foo/bar/*'])
  await host.exec(['update-ref', 'refs/remotes/foo/bar/topic', 'HEAD'])
  const preview = await previewExplicitWorktreeCreation(
    {
      ...request('topic'),
      branch: { kind: 'remote', name: 'topic', remoteRef: 'refs/remotes/foo/bar/topic' }
    },
    undefined,
    host
  )
  expect(explicitCreationTrackingTarget(preview)).toEqual({
    remoteName: 'foo/bar',
    branchName: 'topic'
  })
})
