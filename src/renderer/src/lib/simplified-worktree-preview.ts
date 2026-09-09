import type { ExecutionHostId } from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import { settingsForRepoOwner } from '@/store/slices/worktrees/listing/worktree-owner-settings'
import { getActiveRuntimeTarget, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  ExplicitWorktreeCreation,
  WorktreeCreationPreview
} from '../../../shared/worktree/explicit-creation'

export async function previewSimplifiedWorktree(
  repoId: string,
  explicitCreation: ExplicitWorktreeCreation,
  baseBranch?: string,
  hostId?: ExecutionHostId | null
): Promise<WorktreeCreationPreview> {
  const target = getActiveRuntimeTarget(
    settingsForRepoOwner(useAppStore.getState(), repoId, hostId)
  )
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
  const target = getActiveRuntimeTarget(
    settingsForRepoOwner(useAppStore.getState(), repoId, hostId)
  )
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
