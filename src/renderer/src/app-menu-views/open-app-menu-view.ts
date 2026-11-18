import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import {
  getPortsPanelOwnerKey,
  portsPanelHostForOwnerKey,
  portsPanelReachesSshHost
} from '@/components/right-sidebar/ports-panel-host'
import {
  findAppMenuViewItem,
  type AppMenuViewRequirement,
  type AppMenuViewTarget
} from '../../../shared/app-menu-views'
import { isFolderRepo } from '../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'

// Mirrors the activity bar's gitOnly / folderOnly / sshOnly rules, so the menu never lands on a hidden tab.
function meetsRequirement(state: AppState, requirement: AppMenuViewRequirement): boolean {
  const worktreeId = state.activeWorktreeId
  const isFolderWorkspace = parseWorkspaceKey(worktreeId ?? '')?.type === 'folder'
  switch (requirement) {
    case 'folder-workspace':
      return isFolderWorkspace
    case 'ssh-host':
      return portsPanelReachesSshHost(
        portsPanelHostForOwnerKey(getPortsPanelOwnerKey(state, worktreeId)),
        state.runtimeEnvironments
      )
    case 'git': {
      const repoId = worktreeId ? state.getKnownWorktreeById(worktreeId)?.repoId : undefined
      const repo = repoId ? getIndexedRepoMap(state.repos).get(repoId) : undefined
      return !isFolderWorkspace && !(repo && isFolderRepo(repo))
    }
  }
}

function isAvailable(state: AppState, target: AppMenuViewTarget): boolean {
  switch (target.kind) {
    case 'right-sidebar-tab':
      return !target.requires || meetsRequirement(state, target.requires)
    case 'right-sidebar-search':
      return true
    case 'git-graph':
      return Boolean(state.activeWorktreeId) && meetsRequirement(state, 'git')
  }
}

/** Opens a view picked from the native app menu. Returns whether its target was opened. */
export function openAppMenuView(viewId: unknown): boolean {
  const item = findAppMenuViewItem(viewId)
  if (!item) {
    return false
  }
  const state = useAppStore.getState()
  const { target } = item
  if (!isAvailable(state, target)) {
    toast.info(
      translate('menu.viewUnavailable', '{{view}} is not available in this workspace', {
        view: translate(item.labelKey, item.label)
      })
    )
    return false
  }
  // Why: Settings, Tasks and the other full pages hide the workspace, where every one of these views lives.
  if (!canShowRightSidebarForView(state.activeView)) {
    state.setActiveView('terminal')
  }
  switch (target.kind) {
    case 'right-sidebar-tab':
      state.setRightSidebarTab(target.tab)
      state.setRightSidebarOpen(true)
      return true
    case 'right-sidebar-search':
      state.showRightSidebarSearch()
      return true
    case 'git-graph':
      if (state.activeWorktreeId) {
        state.openGitGraphTab(state.activeWorktreeId)
      }
      return true
  }
}

export function registerAppMenuViewIpcBridge(unsubs: (() => void)[]): void {
  // Why `?.`: the web client and older preloads have no native menu to listen to.
  const unsubscribe = window.api.ui.onOpenAppMenuView?.(openAppMenuView)
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }
}
