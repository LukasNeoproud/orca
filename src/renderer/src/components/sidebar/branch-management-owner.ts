import type { AppState } from '@/store/types'
import type { Worktree } from '../../../../shared/worktree/types'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import {
  resolveWorktreeOperationRoute,
  resolveWorktreeOperationRouteForHost,
  settingsForWorktreeOperationRoute
} from '@/lib/worktree-operation-route'

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
    settings: settingsForWorktreeOperationRoute(state.settings, route)
  }
}
