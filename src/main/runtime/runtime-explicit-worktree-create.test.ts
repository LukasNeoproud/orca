import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, rm, realpath, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitExecFileAsync } from '../git/runner'
import { createRuntimeLocalManagedWorktree } from './runtime-local-worktree-create'
import { createWorktreeCreateTimingRecorder } from '../worktree-create-timing'
import { ignoreCreationLocally } from '../ipc/worktrees/create/ignore-creation-locally'
import { previewWorktreeCreation } from '../ipc/worktrees/create/explicit-creation-preview'
import type { Store } from '../persistence'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'

let root: string
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-explicit-pipeline-')))
  const git = (args: string[]) => gitExecFileAsync(args, { cwd: root })
  await git(['init'])
  await git(['symbolic-ref', 'HEAD', 'refs/heads/master'])
  await git([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'initial'
  ])
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it.each([false, true])(
  'creates an exact nested checkout and pins the label (hook failure recovery=%s)',
  async (recoverCompletedCheckoutFailure) => {
    const repo = { id: 'repo', path: root, displayName: 'Repo', badgeColor: 'blue', addedAt: 0 }
    const metadata = new Map<string, WorktreeMeta>()
    const store = {
      getSettings: () => ({
        workspaceDir: join(root, 'default'),
        nestWorkspaces: true,
        branchPrefix: 'custom',
        branchPrefixCustom: 'ignored',
        refreshLocalBaseRefOnWorktreeCreate: false
      }),
      getRepos: () => [repo],
      getRepo: () => repo,
      getProjectHostSetups: () => [],
      getAllWorktreeMeta: () => Object.fromEntries(metadata),
      getWorktreeMeta: (id: string) => metadata.get(id),
      setWorktreeMeta: (id: string, value: WorktreeMeta) => {
        metadata.set(id, value)
        return value
      }
    } as unknown as Store
    const name = 'feature/123-add-something'
    const ignoreRequest = {
      explicitCreation: {
        branch: { kind: 'new' as const, name },
        destination: { root: '.worktrees', relativeDirectory: name }
      }
    }
    await ignoreCreationLocally(ignoreRequest, repo, store)
    expect((await previewWorktreeCreation(ignoreRequest, repo, store)).needsLocalIgnore).toBe(false)
    const excludePath = join(root, '.git', 'info', 'exclude')
    const exclude = await readFile(excludePath, 'utf8')
    await ignoreCreationLocally(ignoreRequest, repo, store)
    expect(await readFile(excludePath, 'utf8')).toBe(exclude)
    if (recoverCompletedCheckoutFailure) {
      await writeFile(
        join(root, '.git', 'hooks', 'post-checkout'),
        '#!/bin/sh\necho post-checkout: missing-script >&2\nexit 1\n',
        { mode: 0o755 }
      )
    }
    const result = await createRuntimeLocalManagedWorktree({
      rearm: { fire: () => {} },
      timing: createWorktreeCreateTimingRecorder(),
      request: {
        repoSelector: 'repo',
        recoverCompletedCheckoutFailure,
        name,
        pendingFirstAgentMessageRename: true,
        explicitCreation: {
          branch: { kind: 'new', name },
          destination: { root: '.worktrees', relativeDirectory: name }
        }
      },
      repo,
      store,
      createdWithAgent: 'claude',
      resolveRemoteTrackingBase: async () => null,
      hasRemoteTrackingRef: async () => false,
      refreshRemoteTrackingBase: async () => ({ ok: true }),
      fetchRemote: async () => {},
      onWorktreeMetadataPersisted: () => undefined
    })
    expect(Boolean(result.addResult.checkoutWarning)).toBe(recoverCompletedCheckoutFailure)
    expect(result.worktree.path).toBe(join(root, '.worktrees', 'feature', '123-add-something'))
    expect(result.worktree.branch).toBe(`refs/heads/${name}`)
    expect(result.worktree.displayName).toBe(name)
    expect(result.worktree.displayNameMode).toBe('fixed')
    expect(metadata.get(result.worktree.id)?.pendingFirstAgentMessageRename).not.toBe(true)
    await gitExecFileAsync(['remote', 'add', 'foo', root], { cwd: root })
    // Newer Git refuses to add a nested remote name, but configs written earlier still carry one.
    await gitExecFileAsync(['config', 'remote.foo/bar.url', root], { cwd: root })
    await gitExecFileAsync(
      ['config', 'remote.foo/bar.fetch', '+refs/heads/*:refs/remotes/foo/bar/*'],
      {
        cwd: root
      }
    )
    await gitExecFileAsync(
      ['config', 'remote.foo.fetch', '+refs/heads/master:refs/remotes/foo/master'],
      { cwd: root }
    )
    await gitExecFileAsync(['update-ref', 'refs/remotes/foo/bar/topic', 'HEAD'], { cwd: root })
    await gitExecFileAsync(['config', 'branch.autoSetupMerge', 'false'], { cwd: root })
    const tracked = await createRuntimeLocalManagedWorktree({
      rearm: { fire: () => {} },
      timing: createWorktreeCreateTimingRecorder(),
      request: {
        repoSelector: 'repo',
        name: 'topic',
        recoverCompletedCheckoutFailure,
        explicitCreation: {
          branch: { kind: 'remote', name: 'topic', remoteRef: 'foo/bar/topic' },
          destination: { root: '.worktrees', relativeDirectory: 'topic' }
        }
      },
      repo,
      store,
      createdWithAgent: undefined,
      resolveRemoteTrackingBase: async () => null,
      hasRemoteTrackingRef: async () => false,
      refreshRemoteTrackingBase: async () => ({ ok: true }),
      fetchRemote: async () => {},
      onWorktreeMetadataPersisted: () => undefined
    })
    expect(metadata.get(tracked.worktree.id)?.pushTarget).toEqual({
      remoteName: 'foo/bar',
      branchName: 'topic'
    })
    const upstream = await gitExecFileAsync(['rev-parse', '--symbolic-full-name', '@{upstream}'], {
      cwd: tracked.worktree.path
    })
    expect(upstream.stdout.trim()).toBe('refs/remotes/foo/bar/topic')
  }
)
