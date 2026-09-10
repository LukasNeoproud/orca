import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gitExecFileAsync } from '../git/runner'
import { RuntimeBranchManagementCommands } from './runtime-branch-management-commands'
import type { RuntimeGitTarget } from './runtime-git-command-target'
import type { GlobalSettings } from '../../shared/global-settings-types'

describe('branch management host preflight', () => {
  let repo: string
  let sessions: string[] | null
  const pinLabel = vi.fn(async (_target: RuntimeGitTarget) => {})
  let commands: RuntimeBranchManagementCommands
  const git = (args: string[]) => gitExecFileAsync(args, { cwd: repo })
  beforeEach(async () => {
    repo = await mkdtemp(path.join(os.tmpdir(), 'orca-branch-host-'))
    sessions = []
    pinLabel.mockClear()
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
    commands = new RuntimeBranchManagementCommands({
      resolveRuntimeGitTarget: async () =>
        ({
          executionHostId: 'local',
          worktree: { id: `r::${repo}`, path: repo, displayName: 'Original label' }
        }) as RuntimeGitTarget,
      pinManagedBranchSidebarLabel: pinLabel,
      getRuntimeSettings: () => ({}) as GlobalSettings,
      getBranchManagementSessions: async () => sessions
    })
  })
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })
  it.each([{ sessions: ['codex'] }, { sessions: null }])(
    'refuses live or unverifiable sessions and preserves refs',
    async (value) => {
      sessions = value.sessions
      await expect(commands.manageRuntimeBranch('r', 'create', 'blocked')).rejects.toThrow()
      expect(
        (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/blocked'])).stdout
      ).toBe('')
    }
  )
  it('pins the previous displayed label only after a successful Git operation', async () => {
    await commands.manageRuntimeBranch('r', 'create', 'new-branch')
    expect(pinLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        worktree: expect.objectContaining({ displayName: 'Original label' })
      })
    )
    pinLabel.mockClear()
    await expect(commands.manageRuntimeBranch('r', 'create', 'new-branch')).rejects.toThrow(
      'already exists'
    )
    expect(pinLabel).not.toHaveBeenCalled()
  })
  it('rechecks sessions after a clean preview', async () => {
    expect((await commands.inspectRuntimeBranchManagement('r')).blockers).toEqual([])
    sessions = ['codex']
    await expect(commands.manageRuntimeBranch('r', 'create', 'blocked')).rejects.toThrow(
      'Stop active'
    )
  })
  it('blocks sequencer state even when no files are dirty', async () => {
    await mkdir(path.join(repo, '.git', 'sequencer'))
    await expect(commands.manageRuntimeBranch('r', 'create', 'blocked')).rejects.toThrow(
      'ongoing Git operation'
    )
    expect(
      (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/blocked'])).stdout
    ).toBe('')
  })
})
