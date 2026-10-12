import { useAppStore } from '@/store'
import { assertRuntimeEnvironmentCapability, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY } from '../../../shared/backlog-task-association'
import { BACKLOG_RUNTIME_CAPABILITY } from '../../../shared/backlog-types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import {
  refreshLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from '@/runtime/local-runtime-capabilities'
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
  const associationAction = action.startsWith('taskAssociations.')
  const capability = associationAction
    ? BACKLOG_TASK_ASSOCIATIONS_RUNTIME_CAPABILITY
    : BACKLOG_RUNTIME_CAPABILITY
  const updateMessage = associationAction
    ? 'Update the connected Orca runtime to start Backlog tasks.'
    : 'Update the connected Orca runtime to use Backlog.md.'
  if (target.kind === 'environment') {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      capability,
      updateMessage,
      15_000
    )
  }
  if (associationAction && target.kind === 'local') {
    let capabilities = readLocalRuntimeCapabilitiesOrUnknown()
    if (capabilities === null) {
      await refreshLocalRuntimeCapabilities()
      capabilities = readLocalRuntimeCapabilitiesOrUnknown()
    }
    if (capabilities === null) {
      throw new Error(
        'Could not verify runtime support for starting Backlog tasks. Reconnect and retry.'
      )
    }
    if (!capabilities.includes(capability)) {
      throw new Error(updateMessage)
    }
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
