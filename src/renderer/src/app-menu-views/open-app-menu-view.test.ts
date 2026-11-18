import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_MENU_VIEW_ITEMS } from '../../../shared/app-menu-views'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

const { state, toastInfo, reachesSshHost } = vi.hoisted(() => {
  const workspace: {
    activeView: string
    activeWorktreeId: string | null
    repos: { id: string; kind?: 'git' | 'folder' }[]
  } = { activeView: 'terminal', activeWorktreeId: null, repos: [] }
  return {
    state: {
      ...workspace,
      runtimeEnvironments: [],
      getKnownWorktreeById: vi.fn(),
      setActiveView: vi.fn(),
      setRightSidebarTab: vi.fn(),
      setRightSidebarOpen: vi.fn(),
      showRightSidebarSearch: vi.fn(),
      openGitGraphTab: vi.fn()
    },
    toastInfo: vi.fn(),
    reachesSshHost: vi.fn(() => false)
  }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('sonner', () => ({ toast: { info: toastInfo } }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: { view?: string }) =>
    fallback.replace('{{view}}', options?.view ?? '')
}))
vi.mock('@/components/right-sidebar/ports-panel-host', () => ({
  getPortsPanelOwnerKey: () => null,
  portsPanelHostForOwnerKey: () => ({ kind: 'unknown' }),
  portsPanelReachesSshHost: reachesSshHost
}))

import { openAppMenuView, registerAppMenuViewIpcBridge } from './open-app-menu-view'

const GIT_WORKTREE = 'repo-git::/work/app'
const FOLDER_REPO_WORKTREE = 'repo-folder::/work/notes'

describe('openAppMenuView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reachesSshHost.mockReturnValue(false)
    state.activeView = 'terminal'
    state.activeWorktreeId = GIT_WORKTREE
    state.repos = [
      { id: 'repo-git', kind: 'git' },
      { id: 'repo-folder', kind: 'folder' }
    ]
    state.getKnownWorktreeById.mockImplementation((id: string) => ({
      repoId: id === GIT_WORKTREE ? 'repo-git' : 'repo-folder'
    }))
  })

  it.each([
    ['explorer', 'explorer'],
    ['source-control', 'source-control'],
    ['checks', 'checks'],
    ['agents', 'vault'],
    ['backlog', 'backlog'],
    ['pull-requests', 'pull-requests']
  ])('opens the %s panel in the right sidebar', (viewId, tab) => {
    expect(openAppMenuView(viewId)).toBe(true)

    expect(state.setRightSidebarTab).toHaveBeenCalledWith(tab)
    expect(state.setRightSidebarOpen).toHaveBeenCalledWith(true)
    expect(state.setActiveView).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('opens Search through the explorer search view', () => {
    expect(openAppMenuView('search')).toBe(true)
    expect(state.showRightSidebarSearch).toHaveBeenCalledOnce()
  })

  it('opens the Git graph tab of the active worktree', () => {
    expect(openAppMenuView('git-graph')).toBe(true)
    expect(state.openGitGraphTab).toHaveBeenCalledWith(GIT_WORKTREE)
  })

  it('returns to the workspace when a full page hides it', () => {
    state.activeView = 'settings'

    expect(openAppMenuView('pull-requests')).toBe(true)

    expect(state.setActiveView).toHaveBeenCalledWith('terminal')
    expect(state.setRightSidebarTab).toHaveBeenCalledWith('pull-requests')
  })

  it.each([
    ['source-control', FOLDER_REPO_WORKTREE, 'Source Control'],
    ['checks', folderWorkspaceKey('fw-1'), 'Checks'],
    ['git-graph', FOLDER_REPO_WORKTREE, 'Git graph'],
    ['git-graph', null, 'Git graph'],
    ['ports', GIT_WORKTREE, 'Ports'],
    ['attached-worktrees', GIT_WORKTREE, 'Attached worktrees'],
    ['pr-checks', GIT_WORKTREE, 'PR Checks']
  ])(
    'says %s is unavailable in workspace %s instead of opening it',
    (viewId, worktreeId, label) => {
      state.activeWorktreeId = worktreeId

      expect(openAppMenuView(viewId)).toBe(false)

      expect(toastInfo).toHaveBeenCalledWith(`${label} is not available in this workspace`)
      expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
      expect(state.openGitGraphTab).not.toHaveBeenCalled()
      expect(state.setActiveView).not.toHaveBeenCalled()
    }
  )

  it('opens the folder-workspace panels in a folder workspace and Ports on an SSH host', () => {
    state.activeWorktreeId = folderWorkspaceKey('fw-1')
    reachesSshHost.mockReturnValue(true)

    expect(openAppMenuView('attached-worktrees')).toBe(true)
    expect(openAppMenuView('pr-checks')).toBe(true)
    expect(openAppMenuView('ports')).toBe(true)

    expect(state.setRightSidebarTab.mock.calls.map(([tab]) => tab)).toEqual([
      'workspaces',
      'pr-checks',
      'ports'
    ])
  })

  it('has a target for every registered item and ignores unknown ids', () => {
    state.activeWorktreeId = folderWorkspaceKey('fw-1')
    reachesSshHost.mockReturnValue(true)
    const gitOnly = new Set(['source-control', 'checks', 'git-graph'])
    for (const item of APP_MENU_VIEW_ITEMS.filter((entry) => !gitOnly.has(entry.id))) {
      expect(openAppMenuView(item.id), item.id).toBe(true)
    }
    state.activeWorktreeId = GIT_WORKTREE
    for (const id of gitOnly) {
      expect(openAppMenuView(id), id).toBe(true)
    }

    expect(openAppMenuView('not-a-view')).toBe(false)
    expect(openAppMenuView(undefined)).toBe(false)
  })

  it('subscribes to the menu event and tolerates a preload without it', () => {
    const unsubscribe = vi.fn()
    const onOpenAppMenuView = vi.fn(() => unsubscribe)
    const unsubs: (() => void)[] = []

    vi.stubGlobal('window', { api: { ui: { onOpenAppMenuView } } })
    registerAppMenuViewIpcBridge(unsubs)
    expect(onOpenAppMenuView).toHaveBeenCalledWith(openAppMenuView)
    expect(unsubs).toEqual([unsubscribe])

    vi.stubGlobal('window', { api: { ui: {} } })
    registerAppMenuViewIpcBridge(unsubs)
    expect(unsubs).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})
