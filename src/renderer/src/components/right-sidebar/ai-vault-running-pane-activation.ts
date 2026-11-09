import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  findAiVaultSessionLiveStateInIndex,
  findLiveProviderSessionPaneInIndex,
  findRunningOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from './ai-vault-original-pane-index'
import type { AiVaultOriginalPaneTarget } from './ai-vault-original-pane'

/** Focuses the pane that is running this session now; `live` means it runs but has no pane here. */
export function activateRunningOriginalAiVaultSessionPane(
  session: AiVaultSession
): 'activated' | 'live' | 'pane-unavailable' | 'workspace-unavailable' {
  const index = getAiVaultOriginalPaneIndex(useAppStore.getState())
  const target = findRunningOriginalAiVaultSessionPaneInIndex(index, session)
  if (!target) {
    return findAiVaultSessionLiveStateInIndex(index, session) !== null ? 'live' : 'pane-unavailable'
  }
  return focusOriginalPane(target) ? 'activated' : 'workspace-unavailable'
}

/** Focuses the pane whose live agent reports this conversation id; null when none here does. */
export function activateLiveProviderSessionPane(
  agent: string,
  providerSessionId: string
): AiVaultOriginalPaneTarget | null {
  const index = getAiVaultOriginalPaneIndex(useAppStore.getState())
  const target = findLiveProviderSessionPaneInIndex(index, agent, providerSessionId)
  return target && focusOriginalPane(target) ? target : null
}

function focusOriginalPane(target: AiVaultOriginalPaneTarget): boolean {
  const workspaceScope = parseWorkspaceKey(target.worktreeId)
  const activated =
    workspaceScope?.type === 'folder'
      ? activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
      : activateAndRevealWorktree(target.worktreeId)
  if (!activated) {
    return false
  }
  useAppStore.getState().setActiveTabType('terminal', target.worktreeId)
  activateTabAndFocusPane(target.tabId, target.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return true
}
