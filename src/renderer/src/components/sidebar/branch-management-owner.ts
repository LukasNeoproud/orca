import type { AppState } from '@/store/types'
import type { Worktree } from '../../../../shared/worktree/types'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import {
  resolveWorktreeOperationRoute,
  resolveWorktreeOperationRouteForHost
} from '@/lib/worktree-operation-route'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'

export function getBranchManagementOwner(state: AppState, worktree: Worktree) {
  const explicitHost =
    worktree.hostId ??
    (worktree.runtimeOwnerEnvironmentId
      ? toRuntimeExecutionHostId(worktree.runtimeOwnerEnvironmentId)
      : undefined)
  const route = explicitHost
    ? resolveWorktreeOperationRouteForHost(state, worktree.id, explicitHost)
    : resolveWorktreeOperationRoute({ ...state, activeWorktreeId: null }, worktree.id)
  if (!route?.executionHostId) {
    throw new Error('worktree_execution_host_unresolved')
  }
  return {
    executionHostId: route.executionHostId,
    target: runtimeTargetForOwnerEnvironment(route.runtimeEnvironmentId)
  }
}
