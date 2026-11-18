import { useMemo } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type {
  GitDeleteMergedBranchRequest,
  GitDeleteMergedBranchesResult,
  GitMergedBranchesResult
} from '../../../../../../shared/git-merged-branch-cleanup'
import { useWorktreeGitOwnerTarget } from '../../worktree-git-owner-target'

export type GitBranchCleanupActions = {
  /** `target` is one of the result's `targets`; without it the remote's default branch is used. */
  load: (options?: { target?: string; signal?: AbortSignal }) => Promise<GitMergedBranchesResult>
  deleteBranches: (
    branches: GitDeleteMergedBranchRequest[],
    target?: string
  ) => Promise<GitDeleteMergedBranchesResult>
}

/** Merged-branch cleanup for a workspace's repository, run by the host that owns its Git. */
export function useGitBranchCleanup(
  worktreeId: string | null | undefined
): GitBranchCleanupActions | undefined {
  const target = useWorktreeGitOwnerTarget(worktreeId)
  return useMemo(() => {
    // Why not over SSH: the cleanup runs the Git of the host serving the runtime call.
    if (!worktreeId || !target || getConnectionId(worktreeId)) {
      return undefined
    }
    const worktree = toRuntimeWorktreeSelector(worktreeId)
    return {
      // Each branch is proven merged with several Git calls, and the default branch is fetched first.
      load: (options) =>
        callRuntimeRpc<GitMergedBranchesResult>(
          target,
          'git.mergedBranches',
          { worktree, target: options?.target },
          { timeoutMs: 180_000, signal: options?.signal }
        ),
      deleteBranches: (branches, targetRef) =>
        callRuntimeRpc<GitDeleteMergedBranchesResult>(
          target,
          'git.deleteMergedBranches',
          { worktree, branches, target: targetRef },
          { timeoutMs: 300_000 }
        )
    }
  }, [target, worktreeId])
}
