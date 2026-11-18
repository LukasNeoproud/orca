import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getIndexedAllWorktrees } from '@/store/worktree-repo-index'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type {
  GitBranchListResult,
  GitDeleteBranchRequest,
  GitDeleteBranchResult
} from '../../../../../../shared/git-branch-list'
import { useWorktreeGitOwnerTarget } from '../../worktree-git-owner-target'
import { useGitBranchCleanup, type GitBranchCleanupActions } from './use-git-branch-cleanup'

export type GitBranchListActions = {
  list: () => Promise<GitBranchListResult>
  deleteBranch: (request: GitDeleteBranchRequest) => Promise<GitDeleteBranchResult>
  renameBranch: (name: string, newName: string) => Promise<void>
  cleanup: GitBranchCleanupActions
  /** False when no workspace Orca knows lives at that path. */
  openWorkspace: (worktreePath: string) => boolean
  /** Opens the new-workspace composer starting from this branch. */
  createWorkspace: (branchName: string) => void
}

/** The branch list of a workspace's repository; undefined where its host cannot serve it. */
export function useGitBranchList(
  worktreeId: string | null | undefined
): GitBranchListActions | undefined {
  const target = useWorktreeGitOwnerTarget(worktreeId)
  const cleanup = useGitBranchCleanup(worktreeId)
  return useMemo(() => {
    // `cleanup` is absent for the same hosts the list cannot run on, such as SSH.
    if (!worktreeId || !target || !cleanup) {
      return undefined
    }
    const worktree = toRuntimeWorktreeSelector(worktreeId)
    const call = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      callRuntimeRpc<T>(target, method, { worktree, ...params }, { timeoutMs: 90_000 })
    return {
      list: () => call<GitBranchListResult>('git.branches'),
      deleteBranch: (request) => call<GitDeleteBranchResult>('git.deleteBranch', request),
      renameBranch: async (name, newName) => {
        await call('git.renameBranch', { name, newName })
      },
      cleanup,
      openWorkspace: (worktreePath) => {
        const match = getIndexedAllWorktrees(useAppStore.getState().worktreesByRepo).find(
          (candidate) => candidate.path === worktreePath
        )
        return match ? activateAndRevealWorktree(match.id) !== false : false
      },
      createWorkspace: (branchName) => {
        const state = useAppStore.getState()
        const repoId = getIndexedAllWorktrees(state.worktreesByRepo).find(
          (candidate) => candidate.id === worktreeId
        )?.repoId
        state.openModal('new-workspace-composer', {
          ...(repoId ? { initialRepoId: repoId } : {}),
          initialBaseBranch: branchName
        })
      }
    }
  }, [cleanup, target, worktreeId])
}
