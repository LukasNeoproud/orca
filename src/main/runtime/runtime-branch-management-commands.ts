import { readdir } from 'node:fs/promises'
import { resolveGitDir } from '../git/source-control/resolve-git-dir'
import type {
  BranchManagementAction,
  BranchManagementPreview
} from '../../shared/worktree/branch-management'
import type {
  GitDeleteMergedBranchRequest,
  GitDeleteMergedBranchesResult,
  GitMergedBranchesResult
} from '../../shared/git-merged-branch-cleanup'
import { inspectManagedBranches, mutateManagedBranch } from '../git/branch-management'
import { deleteMergedBranches, listMergedBranches } from '../git/merged-branch-cleanup'
import { runWithGitReadCacheInvalidation } from '../git/status'
import {
  localGitOptionsForTarget,
  requireRuntimeGitProvider,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'

const activeMutations = new Set<string>()

export class RuntimeBranchManagementCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  private async context(selector: string) {
    const target = await this.host.resolveRuntimeGitTarget(selector)
    // Refuses hosts this app does not serve, so the Git dir below is always on this machine.
    const provider = requireRuntimeGitProvider(target)
    const git = (args: string[]) => provider.exec(args, target.worktree.path)
    const listWorktrees = () => provider.listWorktrees(target.worktree.path)
    const safety = async () => {
      const blockers: string[] = []
      const entries = await readdir(
        await resolveGitDir(target.worktree.path, localGitOptionsForTarget(target))
      )
      const operationMarkers = [
        'MERGE_HEAD',
        'CHERRY_PICK_HEAD',
        'REVERT_HEAD',
        'BISECT_START',
        'rebase-merge',
        'rebase-apply',
        'sequencer'
      ]
      if (entries.some((entry) => operationMarkers.includes(entry))) {
        blockers.push('Finish the ongoing Git operation before changing branches.')
      }
      const sessions = await this.host.getBranchManagementSessions?.(target)
      if (!sessions) {
        blockers.push('Agent state is unverifiable. Reconnect the execution host and refresh.')
      } else if (sessions.length) {
        blockers.push('Stop active agent and terminal sessions before changing branches.')
      }
      return { blockers, sessions: sessions ?? [] }
    }
    return { target, git, safety, listWorktrees }
  }

  async inspectRuntimeBranchManagement(selector: string): Promise<BranchManagementPreview> {
    const { target, git, safety, listWorktrees } = await this.context(selector)
    const [state, safe] = await Promise.all([inspectManagedBranches(git, listWorktrees), safety()])
    return {
      path: target.worktree.path,
      current: state.current,
      head: state.head,
      branches: state.branches,
      worktrees: state.worktrees,
      sessions: safe.sessions,
      blockers: [
        ...safe.blockers,
        ...(state.dirty
          ? [
              'Commit or remove staged, unstaged, and untracked changes before switching or creating branches.'
            ]
          : [])
      ]
    }
  }

  async manageRuntimeBranch(
    selector: string,
    action: BranchManagementAction,
    branch: string
  ): Promise<{ ok: true }> {
    const { target, git, safety, listWorktrees } = await this.context(selector)
    const key = `${target.executionHostId}\0${target.worktree.path}`
    if (activeMutations.has(key)) {
      throw new Error('A branch change is already in progress.')
    }
    activeMutations.add(key)
    try {
      await runWithGitReadCacheInvalidation(() =>
        mutateManagedBranch(
          git,
          action,
          branch,
          target.worktree.path,
          async () => {
            const result = await safety()
            if (result.blockers.length) {
              throw new Error(result.blockers.join('\n'))
            }
          },
          listWorktrees
        )
      )
      await this.host.pinManagedBranchSidebarLabel?.(target)
      return { ok: true }
    } finally {
      activeMutations.delete(key)
    }
  }

  async listRuntimeMergedBranches(
    selector: string,
    options: { target?: string; signal?: AbortSignal } = {}
  ): Promise<GitMergedBranchesResult> {
    const target = await this.host.resolveRuntimeGitTarget(selector)
    // Refuses hosts this app does not serve; the cleanup runs this machine's Git.
    requireRuntimeGitProvider(target)
    return listMergedBranches(target.worktree.path, {
      ...localGitOptionsForTarget(target),
      ...(options.target ? { target: options.target } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    })
  }

  async deleteRuntimeMergedBranches(
    selector: string,
    branches: readonly GitDeleteMergedBranchRequest[],
    targetRef?: string
  ): Promise<GitDeleteMergedBranchesResult> {
    const target = await this.host.resolveRuntimeGitTarget(selector)
    requireRuntimeGitProvider(target)
    const key = `${target.executionHostId}\0${target.worktree.path}`
    if (activeMutations.has(key)) {
      throw new Error('A branch change is already in progress.')
    }
    activeMutations.add(key)
    try {
      return await runWithGitReadCacheInvalidation(() =>
        deleteMergedBranches(target.worktree.path, branches, {
          ...localGitOptionsForTarget(target),
          ...(targetRef ? { target: targetRef } : {})
        })
      )
    } finally {
      activeMutations.delete(key)
    }
  }
}
