import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { translate } from '@/i18n/i18n'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { findOriginalAiVaultSessionPane } from './ai-vault-original-pane'
import {
  createLazyAiVaultOriginalPaneIndex,
  findAiVaultSessionLiveStateInIndex,
  findOriginalAiVaultSessionPaneInIndex,
  findRunningOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from './ai-vault-original-pane-index'

export function useAiVaultOriginalPaneActions(): {
  getOriginalPaneTarget: (
    session: AiVaultSession
  ) => ReturnType<typeof findOriginalAiVaultSessionPane>
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  jumpToOriginalPane: (session: AiVaultSession) => void
  jumpToWorktree: (worktreeId: string) => void
} {
  const originalPaneLookupState = useAppStore(
    useShallow((s) => ({
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey: s.sleepingAgentSessionsByPaneKey,
      tabsByWorktree: s.tabsByWorktree,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId,
      repos: s.repos,
      worktreesByRepo: s.worktreesByRepo,
      detectedWorktreesByRepo: s.detectedWorktreesByRepo,
      folderWorkspaces: s.folderWorkspaces,
      projectGroups: s.projectGroups,
      activeWorktreeId: s.activeWorktreeId,
      activeWorkspaceExecutionHostId: s.activeWorkspaceExecutionHostId,
      settings: s.settings,
      restoredRuntimeHostIdByWorkspaceSessionKey: s.restoredRuntimeHostIdByWorkspaceSessionKey,
      runtimeEnvironments: s.runtimeEnvironments,
      runtimeEnvironmentCatalogHydrated: s.runtimeEnvironmentCatalogHydrated,
      removedRuntimeEnvironmentIds: s.removedRuntimeEnvironmentIds
    }))
  )
  // Why: loading, filtered, or collapsed views may render no session rows.
  // Build once on the first actual lookup, then share it across visible rows.
  const getOriginalPaneIndex = useMemo(
    () => createLazyAiVaultOriginalPaneIndex(originalPaneLookupState),
    [originalPaneLookupState]
  )

  const getOriginalPaneTarget = useCallback(
    (session: AiVaultSession) =>
      findOriginalAiVaultSessionPaneInIndex(getOriginalPaneIndex(), session),
    [getOriginalPaneIndex]
  )

  const getSessionLiveState = useCallback(
    (session: AiVaultSession) =>
      findAiVaultSessionLiveStateInIndex(getOriginalPaneIndex(), session),
    [getOriginalPaneIndex]
  )

  const jumpToOriginalPane = useCallback((session: AiVaultSession): void => {
    const result = activateOriginalAiVaultSessionPane(session)
    if (result === 'pane-unavailable') {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.originalPaneUnavailable',
          'Original pane is no longer available.'
        )
      )
      return
    }
    if (result === 'workspace-unavailable') {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
          'Worktree is no longer available.'
        )
      )
    }
  }, [])

  const jumpToWorktree = useCallback((worktreeId: string): void => {
    if (!activateAiVaultWorkspace(worktreeId)) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
          'Worktree is no longer available.'
        )
      )
    }
  }, [])

  return { getOriginalPaneTarget, getSessionLiveState, jumpToOriginalPane, jumpToWorktree }
}

export function activateOriginalAiVaultSessionPane(
  session: AiVaultSession
): 'activated' | 'pane-unavailable' | 'workspace-unavailable' {
  return activateAiVaultSessionPaneTarget(
    findOriginalAiVaultSessionPane(useAppStore.getState(), session),
    session.executionHostId
  )
}

export function activateRunningOriginalAiVaultSessionPane(
  session: AiVaultSession
): 'activated' | 'live' | 'pane-unavailable' | 'workspace-unavailable' {
  const state = useAppStore.getState()
  const index = getAiVaultOriginalPaneIndex(state)
  const target = findRunningOriginalAiVaultSessionPaneInIndex(index, session)
  if (!target && findAiVaultSessionLiveStateInIndex(index, session) !== null) {
    return 'live'
  }
  return activateAiVaultSessionPaneTarget(target, session.executionHostId)
}

function activateAiVaultSessionPaneTarget(
  target: ReturnType<typeof findOriginalAiVaultSessionPane>,
  executionHostId: ExecutionHostId
): 'activated' | 'pane-unavailable' | 'workspace-unavailable' {
  if (!target) {
    return 'pane-unavailable'
  }
  if (!activateAiVaultWorkspace(target.worktreeId, executionHostId)) {
    return 'workspace-unavailable'
  }
  useAppStore.getState().setActiveTabType('terminal')
  activateTabAndFocusPane(target.tabId, target.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return 'activated'
}

function activateAiVaultWorkspace(workspaceId: string, executionHostId?: ExecutionHostId): boolean {
  const workspaceScope = parseWorkspaceKey(workspaceId)
  if (workspaceScope?.type === 'folder') {
    return Boolean(
      activateAndRevealFolderWorkspace(
        workspaceScope.folderWorkspaceId,
        executionHostId ? { executionHostId } : undefined
      )
    )
  }
  return Boolean(activateAndRevealWorktree(workspaceId, { executionHostId }))
}
