import type { KeybindingActionId } from './keybindings'
import type { ActiveRightSidebarTab } from './ui-chrome-types'

/** What the active workspace must be for a view to have something to show. */
export type AppMenuViewRequirement = 'git' | 'folder-workspace' | 'ssh-host'

export type AppMenuViewTarget =
  | { kind: 'right-sidebar-tab'; tab: ActiveRightSidebarTab; requires?: AppMenuViewRequirement }
  | { kind: 'right-sidebar-search' }
  | { kind: 'git-graph' }

export type AppMenuViewItem = {
  id: string
  menu: 'view' | 'review'
  /** Locale key and English fallback, resolved in the main process. */
  labelKey: string
  label: string
  /** Shown as a hint only; the renderer's keybinding dispatch owns the chord. */
  shortcutActionId?: KeybindingActionId
  target: AppMenuViewTarget
}

// One record adds a view to the native menu. Labels reuse the panel's own title key so both stay in step.
export const APP_MENU_VIEW_ITEMS: readonly AppMenuViewItem[] = [
  {
    id: 'explorer',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.8bc2bbc3a0',
    label: 'Explorer',
    shortcutActionId: 'sidebar.explorer.toggle',
    target: { kind: 'right-sidebar-tab', tab: 'explorer' }
  },
  {
    id: 'search',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.SearchHeader.693cbeadd0',
    label: 'Search',
    shortcutActionId: 'sidebar.search.toggle',
    target: { kind: 'right-sidebar-search' }
  },
  {
    id: 'source-control',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.0314901467',
    label: 'Source Control',
    shortcutActionId: 'sidebar.sourceControl.toggle',
    target: { kind: 'right-sidebar-tab', tab: 'source-control', requires: 'git' }
  },
  {
    id: 'checks',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.83a10e3c44',
    label: 'Checks',
    shortcutActionId: 'sidebar.checks.toggle',
    target: { kind: 'right-sidebar-tab', tab: 'checks', requires: 'git' }
  },
  {
    id: 'ports',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.441733b630',
    label: 'Ports',
    shortcutActionId: 'sidebar.ports.toggle',
    target: { kind: 'right-sidebar-tab', tab: 'ports', requires: 'ssh-host' }
  },
  {
    id: 'agents',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.aiVaultSessionHistory',
    label: 'Agents',
    target: { kind: 'right-sidebar-tab', tab: 'vault' }
  },
  {
    id: 'backlog',
    menu: 'view',
    labelKey: 'components.backlog.title',
    label: 'Backlog.md',
    target: { kind: 'right-sidebar-tab', tab: 'backlog' }
  },
  {
    id: 'attached-worktrees',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.folderWorkspaces',
    label: 'Attached worktrees',
    target: { kind: 'right-sidebar-tab', tab: 'workspaces', requires: 'folder-workspace' }
  },
  {
    id: 'pr-checks',
    menu: 'view',
    labelKey: 'auto.components.right.sidebar.index.parentPrChecks',
    label: 'PR Checks',
    target: { kind: 'right-sidebar-tab', tab: 'pr-checks', requires: 'folder-workspace' }
  },
  {
    id: 'pull-requests',
    menu: 'review',
    labelKey: 'menu.pullRequests',
    label: 'Pull requests',
    target: { kind: 'right-sidebar-tab', tab: 'pull-requests' }
  },
  {
    id: 'git-graph',
    menu: 'review',
    labelKey: 'components.right-sidebar.gitGraph.title',
    label: 'Git graph',
    target: { kind: 'git-graph' }
  }
]

export function findAppMenuViewItem(id: unknown): AppMenuViewItem | undefined {
  return APP_MENU_VIEW_ITEMS.find((item) => item.id === id)
}
