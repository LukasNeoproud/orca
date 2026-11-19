import { resolveOwner } from '@/lib/resolve-owner'
import type { WorktreeOperationRouteState } from '@/lib/worktree-operation-route'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { authorityKey } from '../../../../shared/host-authority'

/**
 * Whether the workspace lives on this machine, where the Android SDK and adb run. Decided from its
 * rows alone: the Active Server names a host unrelated to the workspace.
 */
export function isAndroidWorkspaceOnThisMachine(
  state: WorktreeOperationRouteState,
  worktreeId: string
): boolean {
  const owner = resolveOwner(state, { workspaceId: worktreeId })
  return owner.kind === 'resolved' && authorityKey(owner.owner) === LOCAL_EXECUTION_HOST_ID
}
