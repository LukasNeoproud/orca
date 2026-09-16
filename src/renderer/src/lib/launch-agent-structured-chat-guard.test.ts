// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  queueStartup: vi.fn(),
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}))

const store = {
  activeRepoId: 'repo-1',
  activeWorktreeId: 'wt-1',
  settings: {
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    agentDefaultEnv: {},
    activeRuntimeEnvironmentId: null,
    experimentalNativeChat: true,
    experimentalStructuredNativeChat: true,
    openAgentTabsInChatByDefault: true
  },
  projects: [],
  repos: [{ id: 'repo-1', connectionId: null, path: '/repo' }],
  worktreesByRepo: {
    'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/repo/worktree' }]
  },
  sshConnectionStates: new Map(),
  transientClearedAgentStatusConnectionIds: {},
  allWorktrees: () => [{ id: 'wt-1', repoId: 'repo-1', path: '/repo/worktree' }],
  tabsByWorktree: { 'wt-1': [] as { id: string }[] },
  openFiles: [],
  browserTabsByWorktree: {},
  tabBarOrderByWorktree: {},
  createTab: mocks.createTab,
  queueTabStartupCommand: mocks.queueStartup,
  setActiveTabType: mocks.setActiveTabType,
  setTabBarOrder: mocks.setTabBarOrder,
  seedNativeChatLaunchDraft: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/telemetry', () => ({ tuiAgentToAgentKind: (agent: string) => agent }))
vi.mock('@/runtime/web-runtime-session', () => ({ isWebRuntimeSessionActive: () => false }))

describe('ordinary agent launch route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createTab.mockReturnValue({ id: 'tab-1' })
  })

  it.each(['codex', 'claude'] as const)(
    'creates a terminal-backed %s tab even when structured chat is enabled',
    async (agent) => {
      const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

      const result = launchAgentInNewTab({ agent, worktreeId: 'wt-1' })

      expect(result?.tabId).toBe('tab-1')
      expect(mocks.createTab).toHaveBeenCalledWith(
        'wt-1',
        undefined,
        undefined,
        expect.objectContaining({ launchAgent: agent, viewMode: 'chat' })
      )
      expect(mocks.queueStartup).toHaveBeenCalledWith(
        'tab-1',
        expect.objectContaining({ launchAgent: agent })
      )
    }
  )
})
