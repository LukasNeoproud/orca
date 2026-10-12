import type { ExecutionHostId } from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import { runtimeTargetForRepoOwner } from '@/lib/repo-runtime-owner'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import type {
  ExplicitWorktreeCreation,
  WorktreeCreationPreview
} from '../../../shared/worktree/explicit-creation'

// The explicit host wins: duplicate repo ids across hosts only resolve through it.
function repoOwnerTarget(repoId: string, hostId?: ExecutionHostId | null): RuntimeClientTarget {
  const target = hostId
    ? ipcOrRuntimeTargetForHostId(hostId)
    : runtimeTargetForRepoOwner(useAppStore.getState(), repoId)
  if (!target) {
    throw new Error('worktree_execution_host_unresolved')
  }
  return target
}

export async function previewSimplifiedWorktree(
  repoId: string,
  explicitCreation: ExplicitWorktreeCreation,
  baseBranch?: string,
  hostId?: ExecutionHostId | null
): Promise<WorktreeCreationPreview> {
  const target = repoOwnerTarget(repoId, hostId)
  if (target.kind === 'environment') {
    return callRuntimeRpc<WorktreeCreationPreview>(target, 'worktree.previewCreation', {
      repo: repoId,
      explicitCreation,
      baseBranch
    })
  }
  return window.api.worktrees.previewCreation({
    repoId,
    explicitCreation,
    baseBranch,
    ...(hostId ? { executionHostId: hostId } : {})
  })
}

export async function ignoreSimplifiedWorktreeLocally(
  repoId: string,
  explicitCreation: ExplicitWorktreeCreation,
  baseBranch?: string,
  hostId?: ExecutionHostId | null
): Promise<void> {
  const target = repoOwnerTarget(repoId, hostId)
  await (target.kind === 'environment'
    ? callRuntimeRpc(target, 'worktree.ignoreCreationLocally', {
        repo: repoId,
        explicitCreation,
        baseBranch
      })
    : window.api.worktrees.ignoreCreationLocally({
        repoId,
        explicitCreation,
        baseBranch,
        ...(hostId ? { executionHostId: hostId } : {})
      }))
}
