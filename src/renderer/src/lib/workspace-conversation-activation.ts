import { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import {
  activateAiVaultStructuredSession,
  refreshStructuredSessionTabs,
  revealStructuredSession
} from './activate-ai-vault-structured-session'
import { activateStructuredAgentSessionById } from './structured-agent-session-tab-activation'
import { activateAndRevealFolderWorkspace, activateAndRevealWorktree } from './worktree-activation'
import { activateTabAndFocusPane } from './activate-tab-and-focus-pane'
import type { ExecutionHostId } from '../../../shared/execution-host'

export type WorkspaceConversationRoute = {
  workspaceId: string
  executionHostId: ExecutionHostId
  runtimeEnvironmentId: string | null
}
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

export function activateConversationWorkspace(route: WorkspaceConversationRoute): boolean {
  const scope = parseWorkspaceKey(route.workspaceId)
  return Boolean(
    scope?.type === 'folder'
      ? activateAndRevealFolderWorkspace(scope.folderWorkspaceId, {
          executionHostId: route.executionHostId
        })
      : activateAndRevealWorktree(route.workspaceId, { executionHostId: route.executionHostId })
  )
}

export function activateConversationTerminal(
  route: WorkspaceConversationRoute,
  tabId: string,
  leafId?: string
): boolean {
  const state = useAppStore.getState()
  if (!(state.tabsByWorktree[route.workspaceId] ?? []).some((tab) => tab.id === tabId)) {
    return false
  }
  if (!activateConversationWorkspace(route)) {
    return false
  }
  const fresh = useAppStore.getState()
  fresh.setActiveTabType('terminal', route.workspaceId)
  fresh.setActiveTab(tabId)
  if (leafId) {
    activateTabAndFocusPane(tabId, leafId)
  }
  return true
}

export async function activateStructuredConversation(
  route: WorkspaceConversationRoute,
  sessionId: string
): Promise<'activated' | 'unverifiable' | 'unavailable'> {
  if (!activateConversationWorkspace(route)) {
    return 'unavailable'
  }
  const runtimeTarget: RuntimeClientTarget = route.runtimeEnvironmentId
    ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' }
  let status: 'activated' | 'unverifiable' | 'unavailable' = 'activated'
  await activateAiVaultStructuredSession(
    { structuredSession: { workspaceId: route.workspaceId, sessionId } },
    {
      activate: activateStructuredAgentSessionById,
      refresh: (workspaceId) => refreshStructuredSessionTabs(workspaceId, runtimeTarget),
      reveal: (target) =>
        revealStructuredSession(runtimeTarget ? { ...target, target: runtimeTarget } : target),
      unavailable: () => {
        status = 'unverifiable'
      },
      gone: () => {
        status = 'unavailable'
      },
      hostCannotOpen: () => {
        status = 'unavailable'
      }
    }
  )
  return status
}
