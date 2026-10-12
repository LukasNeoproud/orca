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
  findRunningOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from './ai-vault-original-pane-index'

/** Focuses the pane that is running this session now; `live` means it runs but has no pane here. */
export function activateRunningOriginalAiVaultSessionPane(
  session: AiVaultSession
): 'activated' | 'live' | 'pane-unavailable' | 'workspace-unavailable' {
  const index = getAiVaultOriginalPaneIndex(useAppStore.getState())
  const target = findRunningOriginalAiVaultSessionPaneInIndex(index, session)
  if (!target) {
    return findAiVaultSessionLiveStateInIndex(index, session) !== null ? 'live' : 'pane-unavailable'
  }
  const workspaceScope = parseWorkspaceKey(target.worktreeId)
  const activated =
    workspaceScope?.type === 'folder'
      ? activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
      : activateAndRevealWorktree(target.worktreeId)
  if (!activated) {
    return 'workspace-unavailable'
  }
  useAppStore.getState().setActiveTabType('terminal', target.worktreeId)
  activateTabAndFocusPane(target.tabId, target.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return 'activated'
}
