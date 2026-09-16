import { useAppStore } from '@/store'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  RuntimeRpcCallError,
  type RuntimeClientTarget
} from '@/runtime/runtime-rpc-client'
import { BACKLOG_RUNTIME_CAPABILITY } from '../../../shared/backlog-types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { resolveWorktreeOperationRoute } from './worktree-operation-route'

export type BacklogRoute = {
  workspaceId: string
  executionHostId: ExecutionHostId
  runtimeEnvironmentId: string | null
}

export function resolveBacklogRoute(workspaceId: string): BacklogRoute {
  const route = resolveWorktreeOperationRoute(useAppStore.getState(), workspaceId)
  if (!route?.executionHostId) {
    throw new Error('The workspace execution host is unavailable.')
  }
  return { workspaceId, ...route, executionHostId: route.executionHostId }
}

export function backlogRouteKey(route: BacklogRoute): string {
  return JSON.stringify([route.runtimeEnvironmentId, route.executionHostId, route.workspaceId])
}

export async function callBacklog<T>(
  route: BacklogRoute,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const target: RuntimeClientTarget = route.runtimeEnvironmentId
    ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' }
  if (target.kind === 'environment') {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      BACKLOG_RUNTIME_CAPABILITY,
      'Update the connected Orca runtime to use Backlog.md.',
      15_000
    )
  }
  try {
    return await callRuntimeRpc<T>(
      target,
      `backlog.${action}`,
      {
        workspaceId: route.workspaceId,
        executionHostId: route.executionHostId,
        ...params
      },
      { timeoutMs: 30_000, suppressFeatureInteraction: true }
    )
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      throw new Error('Update Orca on the execution host to use Backlog.md.')
    }
    throw error
  }
}
