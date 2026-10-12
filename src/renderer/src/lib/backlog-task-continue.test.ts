import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'
import type { BacklogRoute } from './backlog-rpc'
const mock = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  queued: null as { workspaceId: string; tabId: string } | null,
  launch: vi.fn(),
  save: vi.fn(),
  prepare: vi.fn(),
  startup: vi.fn(),
  activate: vi.fn(),
  structured: vi.fn(),
  refresh: vi.fn(),
  reveal: vi.fn(),
  rpc: vi.fn(),
  verdict: 'exited',
  workspaces: [{ id: 'target', path: '/target' }],
  state: {
    tabsByWorktree: {} as Record<string, { id: string }[]>,
    repos: [],
    agentStatusByPaneKey: {} as Record<
      string,
      { providerSession?: { id: string }; agentType?: string; worktreeId?: string }
    >,
    pendingStartupByTabId: {} as Record<string, { resumeProviderSession?: { id: string } }>,
    terminalLayoutsByTabId: {} as Record<
      string,
      { activeLeafId?: string | null; ptyIdsByLeafId?: Record<string, string> }
    >,
    automaticAgentResumeClaimsByTabId: {},
    settings: {},
    setActiveTabType: vi.fn(),
    setActiveTab: vi.fn()
  },
  sessionWorkspace: 'target'
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mock.state,
    subscribe: vi.fn(() => () => {})
  }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mock.rpc }))
vi.mock('./backlog-task-handoff-options', () => ({
  getBacklogTaskWorkspaceOptions: () => mock.workspaces
}))
vi.mock('./backlog-task-association-client', () => ({
  readBacklogTaskAssociation: mock.read,
  saveBacklogTaskAssociation: mock.save
}))
vi.mock('./worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mock.activate,
  activateAndRevealWorktree: mock.activate
}))
vi.mock('./activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('./activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: mock.structured,
  refreshStructuredSessionTabs: mock.refresh,
  revealStructuredSession: mock.reveal
}))
vi.mock('./structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionById: vi.fn()
}))
vi.mock('./ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: mock.prepare
}))
vi.mock('./ai-vault-resume-command', () => ({ buildAiVaultResumeStartupForWorktree: mock.startup }))
vi.mock('./launch-ai-vault-session', () => ({ launchAiVaultSessionInNewTab: mock.launch }))
vi.mock('./ai-vault-session-terminal-owner', () => ({
  findQueuedAiVaultSessionTerminal: () => mock.queued,
  classifyRememberedAiVaultTerminalOwner: () => mock.verdict
}))
vi.mock('@/components/right-sidebar/ai-vault-running-pane-activation', () => ({
  activateRunningOriginalAiVaultSessionPane: () => 'pane-unavailable'
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane-index', () => ({
  findOriginalAiVaultSessionPaneInIndex: () => null,
  getAiVaultOriginalPaneIndex: () => ({})
}))
vi.mock('@/components/right-sidebar/ai-vault-session-activation', () => ({
  classifyRememberedAiVaultSession: () => 'exited'
}))
vi.mock('@/components/right-sidebar/ai-vault-session-worktree', () => ({
  getAiVaultSessionWorktreeMap: ({ sessions }: { sessions: { id: string }[] }) =>
    new Map(sessions.map((session) => [session.id, { worktreeId: mock.sessionWorkspace }]))
}))
import { continueBacklogTask } from './backlog-task-continue'
let sequence = 0
let association: BacklogTaskAssociation
const source: BacklogRoute = {
  workspaceId: 'source',
  executionHostId: 'local',
  runtimeEnvironmentId: null
}
function session(host = 'local') {
  return {
    id: 'history',
    agent: 'codex',
    sessionId: association.session.providerSession!.id,
    executionHostId: host,
    cwd: '/target',
    codexHome: null,
    filePath: '/history.jsonl',
    subagent: null
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.workspaces = [{ id: 'target', path: '/target' }]
  mock.state.tabsByWorktree = {}
  mock.state.agentStatusByPaneKey = {}
  mock.state.pendingStartupByTabId = {}
  mock.state.automaticAgentResumeClaimsByTabId = {}
  mock.state.terminalLayoutsByTabId = {}
  mock.verdict = 'exited'
  mock.queued = null
  mock.sessionWorkspace = 'target'
  association = {
    projectId: 'repo:repo',
    executionHostId: 'local',
    taskId: 'TASK-1',
    sourceWorkspace: { workspaceId: 'source', kind: 'git-worktree' },
    targetWorkspace: { workspaceId: 'target', kind: 'git-worktree' },
    session: { providerSession: { key: 'session_id', id: `provider-${sequence++}` } },
    terminal: { tabId: 'old-tab', paneKey: 'old-tab:leaf', leafId: 'leaf', launchAgent: 'codex' },
    attemptId: 'attempt',
    deliveryStatus: 'unverified',
    createdAt: 1,
    updatedAt: 1
  }
  mock.read.mockImplementation(async () => association)
  mock.activate.mockReturnValue(true)
  mock.prepare.mockImplementation(async (value) => value)
  mock.launch.mockReturnValue({ tabId: 'restored' })
  mock.startup.mockReturnValue({ command: 'codex resume' })
  mock.save.mockImplementation(async (_route, input) => ({ ...association, ...input }))
  mock.list.mockImplementation(async () => ({ sessions: [session()] }))
  vi.stubGlobal('window', { api: { aiVault: { listSessions: mock.list } } })
})
describe('Backlog Continue', () => {
  it('activates an existing local tab without reading or sending the task again', async () => {
    mock.state.tabsByWorktree.target = [{ id: 'old-tab' }]
    mock.verdict = 'unverifiable'
    mock.state.agentStatusByPaneKey['old-tab:leaf'] = {
      providerSession: { id: association.session.providerSession!.id }
    }
    mock.state.terminalLayoutsByTabId['old-tab'] = {
      activeLeafId: 'leaf',
      ptyIdsByLeafId: { leaf: 'remote:owner@@term-live' }
    }
    expect((await continueBacklogTask(source, association)).status).toBe('activated')
    expect(mock.list).not.toHaveBeenCalled()
    expect(mock.launch).not.toHaveBeenCalled()
    expect(mock.save).not.toHaveBeenCalled()
  })
  it('does not mistake a reused tab for the linked provider conversation', async () => {
    mock.state.tabsByWorktree.target = [{ id: 'old-tab' }]
    mock.state.agentStatusByPaneKey['old-tab:leaf'] = {
      providerSession: { id: 'different-conversation' }
    }
    mock.verdict = 'unverifiable'
    mock.list.mockResolvedValue({ sessions: [] })
    expect((await continueBacklogTask(source, association)).status).toBe('unavailable')
    expect(mock.state.setActiveTab).not.toHaveBeenCalled()
  })

  it('restores missing local terminal history and keeps the same attempt and delivery state', async () => {
    const result = await continueBacklogTask(source, association)
    expect(result.status).toBe('restored')
    expect(mock.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: association.session.providerSession!.id })
    )
    expect(mock.launch).toHaveBeenCalledWith({
      agent: 'codex',
      worktreeId: 'target',
      runtimeEnvironmentId: null,
      command: 'codex resume'
    })
    expect(mock.save).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        expectedAttemptId: 'attempt',
        attemptId: 'attempt',
        deliveryStatus: 'unverified',
        terminal: { tabId: 'restored', launchAgent: 'codex' }
      })
    )
  })
  it('does not restart a remote agent when missing terminal ownership is unverifiable', async () => {
    const route = { ...source, executionHostId: 'ssh:remote' as const }
    association.executionHostId = 'ssh:remote'
    mock.verdict = 'unverifiable'
    mock.list.mockResolvedValue({ sessions: [session('ssh:remote')] })
    expect((await continueBacklogTask(route, association)).status).toBe('unverifiable')
    expect(mock.launch).not.toHaveBeenCalled()
    expect(mock.prepare).not.toHaveBeenCalled()
  })
  it('activates an exact live paired SSH mirror without scanning nested history', async () => {
    const route = {
      ...source,
      executionHostId: 'ssh:remote' as const,
      runtimeEnvironmentId: 'owner'
    }
    association.executionHostId = 'ssh:remote'
    mock.state.tabsByWorktree.target = [{ id: 'old-tab' }]
    mock.state.agentStatusByPaneKey['old-tab:leaf'] = {
      providerSession: { id: association.session.providerSession!.id }
    }
    mock.state.terminalLayoutsByTabId['old-tab'] = {
      activeLeafId: 'leaf',
      ptyIdsByLeafId: { leaf: 'remote:owner@@term-live' }
    }
    mock.verdict = 'unverifiable'

    expect((await continueBacklogTask(route, association)).status).toBe('activated')
    expect(mock.list).not.toHaveBeenCalled()
    expect(mock.launch).not.toHaveBeenCalled()
  })
  it('does not activate a same-id mirror owned by another paired runtime', async () => {
    const route = {
      ...source,
      executionHostId: 'ssh:remote' as const,
      runtimeEnvironmentId: 'owner'
    }
    association.executionHostId = 'ssh:remote'
    mock.state.tabsByWorktree.target = [{ id: 'old-tab' }]
    mock.state.agentStatusByPaneKey['old-tab:leaf'] = {
      providerSession: { id: association.session.providerSession!.id }
    }
    mock.state.terminalLayoutsByTabId['old-tab'] = {
      activeLeafId: 'leaf',
      ptyIdsByLeafId: { leaf: 'remote:other-owner@@term-live' }
    }

    expect((await continueBacklogTask(route, association)).status).toBe('unverifiable')
    expect(mock.state.setActiveTab).not.toHaveBeenCalled()
  })
  it('refuses a removed workspace and history belonging to another workspace', async () => {
    mock.workspaces = []
    expect((await continueBacklogTask(source, association)).status).toBe('unavailable')
    expect(mock.list).not.toHaveBeenCalled()
    mock.workspaces = [{ id: 'target', path: '/target' }]
    mock.sessionWorkspace = 'other'
    expect((await continueBacklogTask(source, association)).status).toBe('unavailable')
    expect(mock.launch).not.toHaveBeenCalled()
  })
  it('pins structured restore to the paired owner and surfaces a missing conversation', async () => {
    association.session = { structuredSessionId: 'structured' }
    mock.structured.mockImplementation(async (_session, deps) => {
      await deps.refresh('target')
      await deps.reveal({ worktreeId: 'target', sessionId: 'structured' })
      deps.gone()
      return true
    })
    const route = {
      ...source,
      executionHostId: 'runtime:owner' as const,
      runtimeEnvironmentId: 'owner'
    }
    expect((await continueBacklogTask(route, association)).status).toBe('unavailable')
    expect(mock.refresh).toHaveBeenCalledWith('target', {
      kind: 'environment',
      environmentId: 'owner'
    })
    expect(mock.reveal).toHaveBeenCalledWith({
      worktreeId: 'target',
      sessionId: 'structured',
      target: { kind: 'environment', environmentId: 'owner' }
    })
    expect(mock.launch).not.toHaveBeenCalled()
  })
  it('restores paired history only after the owner proves the provider exited', async () => {
    const route = {
      ...source,
      executionHostId: 'runtime:owner' as const,
      runtimeEnvironmentId: 'owner'
    }
    mock.list.mockResolvedValue({ sessions: [session('runtime:owner')] })
    mock.rpc.mockResolvedValueOnce({ authoritative: true, snapshots: [] }).mockResolvedValueOnce({
      terminals: [],
      totalCount: 0,
      truncated: false,
      hostScope: { hostIds: ['local'], omittedHostIds: [] }
    })
    mock.launch.mockReturnValue({
      tabId: null,
      runtimeLaunch: Promise.resolve({ status: 'created' })
    })
    mock.state.tabsByWorktree.target = [{ id: 'web-terminal-restored' }]
    mock.state.agentStatusByPaneKey['web-terminal-restored:11111111-1111-4111-8111-111111111111'] =
      {
        providerSession: { id: association.session.providerSession!.id },
        agentType: 'codex',
        worktreeId: 'target'
      }
    mock.state.terminalLayoutsByTabId['web-terminal-restored'] = {
      activeLeafId: '11111111-1111-4111-8111-111111111111',
      ptyIdsByLeafId: {
        '11111111-1111-4111-8111-111111111111': 'remote:owner@@term-restored'
      }
    }

    const result = await continueBacklogTask(route, association)

    expect(result.status).toBe('restored')
    expect(mock.launch).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeEnvironmentId: 'owner', worktreeId: 'target' })
    )
    expect(mock.save).toHaveBeenCalledWith(
      route,
      expect.objectContaining({
        terminal: expect.objectContaining({
          tabId: 'web-terminal-restored',
          leafId: '11111111-1111-4111-8111-111111111111',
          ptyId: 'remote:owner@@term-restored'
        })
      })
    )
  })
  it('does not duplicate a queued resume owned by another workspace', async () => {
    mock.queued = { workspaceId: 'other', tabId: 'pending' }
    expect((await continueBacklogTask(source, association)).status).toBe('unverifiable')
    expect(mock.launch).not.toHaveBeenCalled()
  })

  it('rejects an association from another paired runtime before revealing a session', async () => {
    mock.read.mockResolvedValue({ ...association, attemptId: 'different-owner-attempt' })
    expect(
      (
        await continueBacklogTask(
          { ...source, executionHostId: 'runtime:other', runtimeEnvironmentId: 'other' },
          association
        )
      ).status
    ).toBe('unavailable')
    expect(mock.structured).not.toHaveBeenCalled()
    expect(mock.launch).not.toHaveBeenCalled()
  })

  it('treats a lost SSH connection as unverifiable, never an exited agent', async () => {
    association.executionHostId = 'ssh:remote'
    mock.list.mockRejectedValue(new Error('Disconnected'))
    expect(
      (await continueBacklogTask({ ...source, executionHostId: 'ssh:remote' }, association)).status
    ).toBe('unverifiable')
    expect(mock.launch).not.toHaveBeenCalled()
  })
})
