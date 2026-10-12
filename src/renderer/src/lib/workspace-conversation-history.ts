import type { ResumableTuiAgent } from '../../../shared/agent-session-resume'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { useAppStore } from '@/store'
import { activateRunningOriginalAiVaultSessionPane } from '@/components/right-sidebar/ai-vault-running-pane-activation'
import {
  findOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from '@/components/right-sidebar/ai-vault-original-pane-index'
import { classifyRememberedAiVaultSession } from '@/components/right-sidebar/ai-vault-session-activation'
import { openAiVaultSession, type AiVaultSessionOpenedTarget } from './ai-vault-session-open'
import { prepareAiVaultSessionForResume } from './ai-vault-session-resume-preparation'
import { buildAiVaultResumeStartupForWorktree } from './ai-vault-resume-command'
import { launchAiVaultSessionInNewTab } from './launch-ai-vault-session'
import {
  findQueuedAiVaultSessionTerminal,
  classifyRememberedAiVaultTerminalOwner
} from './ai-vault-session-terminal-owner'
import {
  activateConversationWorkspace as activateWorkspace,
  activateConversationTerminal as activateTerminal,
  activateStructuredConversation as activateStructured
} from './workspace-conversation-activation'
import type { WorkspaceConversationRoute } from './workspace-conversation-activation'
import type { PairedProviderOwnerVerdict } from './backlog-task-paired-terminal-owner'
import { waitForRestoredBacklogTerminal } from './backlog-task-restored-terminal'

export type WorkspaceConversationTerminal = {
  tabId: string
  leafId?: string
  paneKey?: string
  ptyId?: string
  launchAgent?: ResumableTuiAgent
}
export type WorkspaceConversationOpenStatus =
  | 'activated'
  | 'restored'
  | 'unverifiable'
  | 'unavailable'

export async function openWorkspaceConversationHistory(
  route: WorkspaceConversationRoute,
  session: AiVaultSession,
  options: {
    terminal?: WorkspaceConversationTerminal
    pairedOwnerClassifier?: () => Promise<PairedProviderOwnerVerdict>
    onRestored: (
      target: AiVaultSessionOpenedTarget,
      terminal?: WorkspaceConversationTerminal
    ) => Promise<void>
  }
): Promise<WorkspaceConversationOpenStatus> {
  let status: WorkspaceConversationOpenStatus = 'unavailable'
  let pairedOwnerVerdict: Promise<PairedProviderOwnerVerdict> | undefined
  const classifyPairedOwner = (): Promise<PairedProviderOwnerVerdict> | undefined => {
    pairedOwnerVerdict ??= options.pairedOwnerClassifier?.()
    return pairedOwnerVerdict
  }
  const activateTarget = async (target: AiVaultSessionOpenedTarget): Promise<boolean> => {
    if (target.workspaceId !== route.workspaceId) {
      return false
    }
    if (target.kind === 'structured') {
      status = await activateStructured(route, target.sessionId)
      return status === 'activated'
    }
    const activated = activateTerminal(route, target.tabId)
    if (activated) {
      status = 'activated'
    }
    return activated
  }
  await openAiVaultSession(session, 'terminal', route.workspaceId, {
    activateRemembered: activateTarget,
    classifyRemembered: async (owned, target) =>
      (await classifyPairedOwner()) ?? classifyRememberedAiVaultSession(owned, target),
    activateExistingTerminal: (owned) => {
      const original = findOriginalAiVaultSessionPaneInIndex(
        getAiVaultOriginalPaneIndex(useAppStore.getState()),
        owned
      )
      if (original && original.worktreeId !== route.workspaceId) {
        status = 'unavailable'
        return 'live'
      }
      const active = activateRunningOriginalAiVaultSessionPane(owned)
      if (active === 'activated') {
        status = 'activated'
        return 'live'
      }
      if (active === 'live' || active === 'workspace-unavailable') {
        status = 'unverifiable'
        return 'live'
      }
      const queued = findQueuedAiVaultSessionTerminal(useAppStore.getState(), owned)
      if (queued) {
        status =
          queued.workspaceId === route.workspaceId && activateTerminal(route, queued.tabId)
            ? 'activated'
            : 'unverifiable'
        return 'pending'
      }
      return null
    },
    activateExistingStructured: async (owned) => {
      if (owned.structuredSession?.workspaceId === route.workspaceId) {
        status = await activateStructured(route, owned.structuredSession.sessionId)
      }
    },
    ownershipUnverifiable: () => {
      status = 'unverifiable'
    },
    openStructured: async () => null,
    openTerminal: async (owned) => {
      if (route.executionHostId !== 'local') {
        const verdict =
          (await classifyPairedOwner()) ??
          (options.terminal &&
            classifyRememberedAiVaultTerminalOwner(useAppStore.getState(), route.executionHostId, {
              workspaceId: route.workspaceId,
              tabId: options.terminal.tabId
            }))
        if (verdict !== 'exited') {
          status = 'unverifiable'
          return null
        }
      }
      const prepared = await prepareAiVaultSessionForResume(owned)
      if (!activateWorkspace(route)) {
        return null
      }
      const state = useAppStore.getState()
      const launched = launchAiVaultSessionInNewTab({
        agent: prepared.agent,
        worktreeId: route.workspaceId,
        runtimeEnvironmentId: route.runtimeEnvironmentId,
        ...buildAiVaultResumeStartupForWorktree({
          state,
          worktreeId: route.workspaceId,
          session: prepared,
          commandOverride: state.settings?.agentCmdOverrides?.[prepared.agent]
        })
      })
      if (launched.tabId === null) {
        const outcome = await launched.runtimeLaunch
        if (outcome.status !== 'created') {
          status = 'unverifiable'
          return null
        }
        const restored = await waitForRestoredBacklogTerminal(
          prepared,
          route.workspaceId,
          route.runtimeEnvironmentId
        )
        if (!restored) {
          status = 'unverifiable'
          return null
        }
        const target = {
          kind: 'terminal' as const,
          workspaceId: route.workspaceId,
          tabId: restored.tabId
        }
        await options.onRestored(target, restored)
        activateTerminal(route, restored.tabId, restored.leafId)
        status = 'restored'
        return target
      }
      const target = {
        kind: 'terminal' as const,
        workspaceId: route.workspaceId,
        tabId: launched.tabId
      }
      await options.onRestored(target)
      activateTerminal(route, launched.tabId)
      status = 'restored'
      return target
    }
  })
  return status
}
