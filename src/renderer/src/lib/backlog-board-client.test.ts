import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPage } from '../../../shared/browser-workspace-types'

const mock = vi.hoisted(() => {
  const state = {
    browserPagesByWorkspace: {} as Record<string, BrowserPage[]>,
    remoteBrowserPageHandlesByPageId: {} as Record<string, { remotePageId: string }>,
    setBrowserPageUrl: vi.fn((pageId: string, url: string) => {
      for (const pages of Object.values(state.browserPagesByWorkspace)) {
        const page = pages.find((candidate) => candidate.id === pageId)
        if (page) {
          page.url = url
        }
      }
    }),
    setActiveWorktree: vi.fn(),
    focusBrowserTabInWorktree: vi.fn()
  }
  return {
    state,
    callBacklog: vi.fn(),
    callRuntimeRpc: vi.fn(),
    resolveBacklogRoute: vi.fn(),
    resolveWorktreeOperationRouteForHost: vi.fn(),
    openWorkspaceBrowserTab: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: { getState: () => mock.state, subscribe: vi.fn() }
}))
vi.mock('./backlog-rpc', () => ({
  backlogRouteKey: (route: {
    workspaceId: string
    executionHostId: string
    runtimeEnvironmentId: string | null
  }) => JSON.stringify([route.workspaceId, route.executionHostId, route.runtimeEnvironmentId]),
  callBacklog: mock.callBacklog,
  resolveBacklogRoute: mock.resolveBacklogRoute
}))
vi.mock('./worktree-operation-route', () => ({
  resolveWorktreeOperationRouteForHost: mock.resolveWorktreeOperationRouteForHost
}))
vi.mock('./workspace-browser-tab-open', () => ({
  openWorkspaceBrowserTab: mock.openWorkspaceBrowserTab
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mock.callRuntimeRpc }))
vi.mock('@/runtime/runtime-worktree-selector', () => ({
  toRuntimeWorktreeSelector: (id: string) => id
}))
vi.mock('@/components/browser-pane/host-guest/webview-registry', () => ({
  webviewRegistry: new Map()
}))

const binding = {
  workspaceId: 'wt-1',
  executionHostId: 'runtime:env-1' as const,
  runtimeEnvironmentId: 'env-1'
}

function page(url: string): BrowserPage {
  return {
    id: 'page-1',
    workspaceId: 'browser-1',
    worktreeId: 'wt-1',
    url,
    title: 'Backlog.md',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    backlogBoardBinding: binding
  }
}

describe('Backlog board lease', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mock.state.browserPagesByWorkspace = { 'browser-1': [page('http://127.0.0.1:7000')] }
    mock.state.remoteBrowserPageHandlesByPageId = { 'page-1': { remotePageId: 'remote-page-1' } }
    mock.resolveBacklogRoute.mockReturnValue(binding)
    mock.resolveWorktreeOperationRouteForHost.mockReturnValue(binding)
    mock.callBacklog.mockResolvedValue({
      url: 'http://127.0.0.1:8000',
      port: 8000,
      instanceId: 'new'
    })
    mock.callRuntimeRpc.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('reacquires an existing board and navigates the remote page to a changed port', async () => {
    const { openBacklogBoard } = await import('./backlog-board-client')
    await openBacklogBoard('wt-1')

    expect(mock.callBacklog).toHaveBeenCalledWith(binding, 'acquireBoard', expect.any(Object))
    expect(mock.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'browser.goto',
      { worktree: 'wt-1', page: 'remote-page-1', url: 'http://127.0.0.1:8000' },
      { timeoutMs: 15_000 }
    )
    expect(mock.state.setBrowserPageUrl).toHaveBeenCalledWith('page-1', 'http://127.0.0.1:8000')
    expect(mock.openWorkspaceBrowserTab).not.toHaveBeenCalled()
  })

  it('uses the bound host when another host is selected for the same workspace ID', async () => {
    const { acquireBoundBacklogBoard } = await import('./backlog-board-client')
    await acquireBoundBacklogBoard(binding, 'page-1')
    expect(mock.resolveWorktreeOperationRouteForHost).toHaveBeenCalledWith(
      mock.state,
      'wt-1',
      binding.executionHostId
    )
    expect(mock.resolveBacklogRoute).not.toHaveBeenCalled()
  })
})
