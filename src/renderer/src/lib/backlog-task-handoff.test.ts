import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callBacklog: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  workspaces: vi.fn(),
  conversations: vi.fn(),
  detect: vi.fn(),
  launchBackground: vi.fn(),
  launchAiVault: vi.fn(),
  prepareHistory: vi.fn(),
  deliver: vi.fn(),
  sendNotes: vi.fn(),
  launchRoute: vi.fn(),
  structuredLaunch: vi.fn(),
  structuredCall: vi.fn(),
  structuredEnqueue: vi.fn(),
  structuredMutate: vi.fn(),
  openAiVault: vi.fn(),
  findOriginalPane: vi.fn(),
  pairedOwner: vi.fn(),
  restoredTerminal: vi.fn(),
  activateStructured: vi.fn(),
  state: {
    settings: {},
    agentStatusByPaneKey: {} as Record<string, { providerSession?: unknown }>,
    tabsByWorktree: {} as Record<string, { id: string }[]>,
    terminalLayoutsByTabId: {},
    setActiveTabType: vi.fn(),
    setActiveTab: vi.fn()
  }
}))

vi.mock('./backlog-rpc', () => ({ callBacklog: mocks.callBacklog }))
vi.mock('./backlog-task-association-client', () => ({
  saveBacklogTaskAssociation: mocks.save,
  confirmBacklogTaskAssociation: mocks.confirm
}))
vi.mock('./backlog-task-handoff-options', () => ({
  getBacklogTaskWorkspaceOptions: mocks.workspaces,
  getBacklogTaskConversationOptions: mocks.conversations
}))
vi.mock('@/lib/launch-agent-session-continuation', () => ({
  detectAgentSessionContinuationAgents: mocks.detect
}))
vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: mocks.launchBackground
}))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: mocks.launchAiVault
}))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: mocks.prepareHistory
}))
vi.mock('@/lib/ai-vault-resume-command', () => ({
  buildAiVaultResumeStartupForWorktree: vi.fn(() => ({ command: 'resume' }))
}))
vi.mock('@/lib/agent-launch-prompt-delivery', () => ({
  deliverLaunchPromptToAgentTab: mocks.deliver
}))
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: mocks.sendNotes
}))
vi.mock('@/lib/agent-launch-routing', () => ({ resolveAgentLaunchRoute: mocks.launchRoute }))
vi.mock('@/lib/structured-agent-session-launch', () => ({
  startStructuredAgentLaunch: mocks.structuredLaunch
}))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.structuredCall
}))
vi.mock('@/components/native-chat/structured-agent-session-outbox-storage', () => ({
  enqueueStructuredAgentSessionPrompt: mocks.structuredEnqueue,
  mutateStructuredAgentSessionLaunchPrompt: mocks.structuredMutate
}))
vi.mock('@/lib/activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: mocks.activateStructured
}))
vi.mock('./ai-vault-session-open', () => ({
  openAiVaultSession: mocks.openAiVault
}))
vi.mock('./backlog-task-paired-terminal-owner', () => ({
  classifyPairedProviderOwner: mocks.pairedOwner
}))
vi.mock('./backlog-task-restored-terminal', () => ({
  waitForRestoredBacklogTerminal: mocks.restoredTerminal
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane-index', () => ({
  findOriginalAiVaultSessionPaneInIndex: mocks.findOriginalPane,
  getAiVaultOriginalPaneIndex: vi.fn(() => null)
}))
vi.mock('@/lib/backlog-task-conversation-activation', () => ({
  activateBacklogTaskStructuredConversation: mocks.activateStructured,
  activateBacklogTaskTerminal: vi.fn(() => true),
  activateBacklogTaskWorkspace: vi.fn(() => true)
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn(() => true),
  activateAndRevealFolderWorkspace: vi.fn(() => true)
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('@/lib/ai-vault-session-terminal-owner', () => ({
  findQueuedAiVaultSessionTerminal: vi.fn(() => null)
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, {
    getState: () => mocks.state,
    subscribe: vi.fn(() => () => {})
  })
}))

import { BacklogTaskHandoffError, startBacklogTask } from './backlog-task-handoff'

const route = {
  workspaceId: 'repo::/work',
  executionHostId: 'local' as const,
  runtimeEnvironmentId: null
}
const task = {
  id: 'TASK-1',
  title: 'Ship it',
  status: 'To Do',
  priority: null,
  description: '**Latest** details',
  acceptanceCriteria: [{ index: 1, text: 'Works', checked: true }]
}
const pendingAssociation = {
  projectId: 'repo:repo',
  executionHostId: 'local' as const,
  taskId: task.id,
  sourceWorkspace: { workspaceId: route.workspaceId, kind: 'git-worktree' as const },
  targetWorkspace: { workspaceId: route.workspaceId, kind: 'git-worktree' as const },
  session: {},
  attemptId: 'attempt',
  deliveryStatus: 'pending' as const,
  createdAt: 1,
  updatedAt: 1
}

describe('startBacklogTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.settings = {}
    mocks.state.agentStatusByPaneKey = {}
    mocks.state.tabsByWorktree = {}
    mocks.callBacklog.mockResolvedValue(task)
    mocks.workspaces.mockReturnValue([{ id: route.workspaceId }])
    mocks.conversations.mockResolvedValue([])
    mocks.detect.mockResolvedValue(['claude'])
    mocks.launchRoute.mockReturnValue('terminal-tui')
    mocks.save.mockImplementation(async (_route, write) => ({
      ...pendingAssociation,
      session: write.session,
      terminal: write.terminal,
      attemptId: write.attemptId,
      deliveryStatus: write.deliveryStatus
    }))
    mocks.deliver.mockResolvedValue(true)
    mocks.sendNotes.mockResolvedValue({ status: 'sent' })
    mocks.prepareHistory.mockImplementation(async (session) => session)
    mocks.findOriginalPane.mockReturnValue(null)
    mocks.openAiVault.mockImplementation(async (session, _mode, workspaceId, deps) => {
      if (deps.activateExistingTerminal(session)) {
        return
      }
      const target = await deps.openTerminal(session, workspaceId)
      if (target) {
        await deps.activateRemembered(target)
      }
    })
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000001'
    })
    vi.stubGlobal('window', {
      api: { aiVault: { listSessions: vi.fn() } },
      setTimeout,
      clearTimeout
    })
  })

  it('persists the terminal attempt before sending the freshly read Markdown task', async () => {
    mocks.state.agentStatusByPaneKey['tab:00000000-0000-4000-8000-000000000001'] = {
      providerSession: { key: 'session_id', id: 'provider-1' }
    }
    mocks.launchBackground.mockResolvedValue({
      tabId: 'tab',
      paneKey: 'tab:00000000-0000-4000-8000-000000000001',
      ptyId: 'pty',
      startupPlan: {},
      terminalOwnership: null
    })

    const result = await startBacklogTask({
      sourceRoute: route,
      targetRoute: route,
      taskId: task.id,
      conversation: { kind: 'new', agent: 'claude' },
      expectedAttemptId: null
    })

    expect(mocks.callBacklog).toHaveBeenCalledWith(route, 'task', { taskId: task.id })
    expect(mocks.launchBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: route.workspaceId,
        executionHostId: route.executionHostId,
        runtimeEnvironmentId: null
      })
    )
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deliver.mock.invocationCallOrder[0]!
    )
    expect(mocks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          '# Backlog task TASK-1: Ship it\n\n## Description\n\n**Latest** details\n\n## Acceptance criteria\n\n- [x] 1. Works',
        submit: true
      })
    )
    expect(result.status).toBe('unverified')
    expect(result.association.session).toEqual({
      agent: 'claude',
      title: 'Ship it',
      providerSession: { key: 'session_id', id: 'provider-1' }
    })
  })

  it('uses the normal explicit terminal send path for a live existing conversation', async () => {
    const conversation = {
      id: 'terminal:one',
      title: 'Existing',
      updatedAt: null,
      surface: 'terminal' as const,
      agent: 'claude' as const,
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      terminal: { tabId: 'tab-1', leafId: 'leaf-1', paneKey: 'tab-1:leaf-1' }
    }
    mocks.conversations.mockResolvedValue([conversation])

    await startBacklogTask({
      sourceRoute: route,
      targetRoute: route,
      taskId: task.id,
      conversation: { kind: 'existing', conversation },
      expectedAttemptId: null
    })

    expect(mocks.sendNotes).toHaveBeenCalledWith(
      expect.objectContaining({ noteTarget: { tabId: 'tab-1', leafId: 'leaf-1' } })
    )
    expect(mocks.launchBackground).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })

  it.each(['persist', 'send'] as const)(
    'does not retry a failed terminal %s and retains any durable attempt',
    async (failurePoint) => {
      const conversation = {
        id: 'terminal:one',
        title: 'Existing',
        updatedAt: null,
        surface: 'terminal' as const,
        agent: 'claude' as const,
        providerSession: { key: 'session_id' as const, id: 'provider-1' },
        terminal: { tabId: 'tab-1', leafId: 'leaf-1', paneKey: 'tab-1:leaf-1' }
      }
      mocks.conversations.mockResolvedValue([conversation])
      if (failurePoint === 'persist') {
        mocks.save.mockRejectedValueOnce(new Error('disk unavailable'))
      } else {
        mocks.sendNotes.mockResolvedValueOnce({ status: 'failed' })
      }
      const result = startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
      if (failurePoint === 'persist') {
        await expect(result).rejects.toThrow('disk unavailable')
        expect(mocks.sendNotes).not.toHaveBeenCalled()
      } else {
        await expect(result).rejects.toMatchObject({
          association: {
            taskId: task.id,
            deliveryStatus: 'pending',
            session: { providerSession: conversation.providerSession }
          }
        })
        expect(mocks.sendNotes).toHaveBeenCalledOnce()
      }
      expect(mocks.save).toHaveBeenCalledOnce()
      expect(mocks.deliver).not.toHaveBeenCalled()
      expect(mocks.confirm).not.toHaveBeenCalled()
    }
  )

  it('does not replay an ambiguous structured send', async () => {
    const conversation = {
      id: 'structured:session-1',
      title: 'Chat',
      updatedAt: null,
      surface: 'structured' as const,
      agent: 'claude' as const,
      structuredSessionId: 'session-1'
    }
    mocks.conversations.mockResolvedValue([conversation])
    mocks.structuredEnqueue.mockReturnValue({
      sessionId: 'session-1',
      clientMessageId: 'message-1',
      body: {},
      previewUris: [],
      state: 'queued',
      queuedAt: 1,
      lastAttemptAt: null,
      retryAfterUnknownSubmittedAt: null
    })
    mocks.structuredCall
      .mockResolvedValueOnce({ ok: true, page: { fence: 3 } })
      .mockResolvedValueOnce({
        ok: true,
        value: { submission: { dispatchState: 'unknown' } }
      })

    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
    ).rejects.toBeInstanceOf(BacklogTaskHandoffError)

    expect(mocks.structuredCall).toHaveBeenCalledTimes(2)
    expect(mocks.structuredMutate).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('confirms a structured association only after an accepted host dispatch', async () => {
    const conversation = {
      id: 'structured:session-1',
      title: 'Chat',
      updatedAt: null,
      surface: 'structured' as const,
      agent: 'claude' as const,
      structuredSessionId: 'session-1'
    }
    mocks.conversations.mockResolvedValue([conversation])
    mocks.structuredEnqueue.mockReturnValue({
      sessionId: 'session-1',
      clientMessageId: 'message-1'
    })
    mocks.structuredCall
      .mockResolvedValueOnce({ ok: true, page: { fence: 3 } })
      .mockResolvedValueOnce({
        ok: true,
        value: { submission: { dispatchState: 'accepted' } }
      })
    mocks.confirm.mockResolvedValue({ ...pendingAssociation, deliveryStatus: 'confirmed' })
    mocks.activateStructured.mockResolvedValue(true)

    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
    ).resolves.toMatchObject({ status: 'confirmed' })

    expect(mocks.confirm.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.structuredCall.mock.invocationCallOrder[1]!
    )
  })

  it('creates an explicit structured chat empty, persists it, then sends the task', async () => {
    mocks.structuredLaunch.mockReturnValue({
      launchResult: Promise.resolve({ sessionId: 'new-session', fence: 7 })
    })
    mocks.structuredEnqueue.mockReturnValue({
      sessionId: 'new-session',
      clientMessageId: 'message-1'
    })
    mocks.structuredCall.mockResolvedValue({
      ok: true,
      value: { submission: { dispatchState: 'accepted' } }
    })
    mocks.confirm.mockResolvedValue({ ...pendingAssociation, deliveryStatus: 'confirmed' })
    mocks.activateStructured.mockResolvedValue('activated')

    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'new', agent: 'claude', surface: 'structured' },
        expectedAttemptId: null
      })
    ).resolves.toMatchObject({ status: 'confirmed' })

    expect(mocks.structuredLaunch).toHaveBeenCalledWith(route.workspaceId, 'claude', {
      requestId: expect.any(String)
    })
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.structuredCall.mock.invocationCallOrder[0]!
    )
  })

  it('ownership-checks and restores closed history before persisting and delivering', async () => {
    const conversation = {
      id: 'history:claude:provider-1',
      title: 'Closed session',
      updatedAt: null,
      surface: 'terminal' as const,
      agent: 'claude' as const,
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      history: { filePath: '/history/provider-1.jsonl', cwd: '/work' }
    }
    const historySession = {
      agent: 'claude',
      sessionId: 'provider-1',
      executionHostId: 'local',
      cwd: '/work',
      codexHome: null,
      filePath: '/history/provider-1.jsonl'
    }
    mocks.conversations.mockResolvedValue([conversation])
    ;(window.api.aiVault.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [historySession]
    })
    mocks.launchAiVault.mockReturnValue({ tabId: 'restored-tab' })

    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
    ).resolves.toMatchObject({ status: 'unverified' })

    expect(mocks.prepareHistory).toHaveBeenCalledWith(historySession)
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deliver.mock.invocationCallOrder[0]!
    )
    expect(mocks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'restored-tab', submit: true })
    )
    expect(mocks.sendNotes).not.toHaveBeenCalled()
  })

  it('shares the history-identity fence when two Starts race to restore one provider session', async () => {
    const conversation = {
      id: 'history:claude:provider-1',
      title: 'Closed session',
      updatedAt: null,
      surface: 'terminal' as const,
      agent: 'claude' as const,
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      history: { filePath: '/history/provider-1.jsonl' }
    }
    const historySession = {
      agent: 'claude',
      sessionId: 'provider-1',
      executionHostId: 'local',
      filePath: conversation.history.filePath,
      codexHome: null
    }
    mocks.conversations.mockResolvedValue([conversation])
    ;(window.api.aiVault.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [historySession]
    })
    mocks.launchAiVault.mockReturnValue({ tabId: 'restored-tab' })
    let target: { kind: 'terminal'; workspaceId: string; tabId: string } | null = null
    let opening = false
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.openAiVault.mockImplementation(async (session, _mode, workspaceId, deps) => {
      if (opening) {
        await ready
        await deps.activateRemembered(target!)
        return
      }
      opening = true
      target = await deps.openTerminal(session, workspaceId)
      release()
    })

    await Promise.all([
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      }),
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
    ])

    expect(mocks.launchAiVault).toHaveBeenCalledOnce()
    expect(mocks.prepareHistory).toHaveBeenCalledOnce()
  })

  it('retains the exact leaf when a live terminal owner appears during the fenced history open', async () => {
    const conversation = {
      id: 'history:claude:provider-1',
      title: 'Closed session',
      updatedAt: null,
      surface: 'terminal' as const,
      agent: 'claude' as const,
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      history: { filePath: '/history/provider-1.jsonl' }
    }
    mocks.conversations.mockResolvedValue([conversation])
    ;(window.api.aiVault.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        {
          agent: 'claude',
          sessionId: 'provider-1',
          executionHostId: 'local',
          filePath: conversation.history.filePath,
          codexHome: null
        }
      ]
    })
    mocks.findOriginalPane.mockReturnValue({
      worktreeId: route.workspaceId,
      tabId: 'live-tab',
      leafId: 'live-leaf',
      paneKey: 'live-tab:live-leaf'
    })

    await startBacklogTask({
      sourceRoute: route,
      targetRoute: route,
      taskId: task.id,
      conversation: { kind: 'existing', conversation },
      expectedAttemptId: null
    })

    expect(mocks.sendNotes).toHaveBeenCalledWith(
      expect.objectContaining({ noteTarget: { tabId: 'live-tab', leafId: 'live-leaf' } })
    )
    expect(mocks.launchAiVault).not.toHaveBeenCalled()
  })

  it('does not restore ownerless remote history when process ownership is unverifiable', async () => {
    const remoteRoute = {
      workspaceId: route.workspaceId,
      executionHostId: 'ssh:server' as const,
      runtimeEnvironmentId: null
    }
    const conversation = {
      id: 'history:claude:provider-1',
      title: 'Remote history',
      updatedAt: null,
      surface: 'terminal' as const,
      agent: 'claude' as const,
      providerSession: { key: 'session_id' as const, id: 'provider-1' },
      history: { filePath: '/history/provider-1.jsonl' }
    }
    mocks.workspaces.mockReturnValue([{ id: remoteRoute.workspaceId }])
    mocks.conversations.mockResolvedValue([conversation])
    ;(window.api.aiVault.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        {
          agent: 'claude',
          sessionId: 'provider-1',
          executionHostId: remoteRoute.executionHostId,
          filePath: conversation.history.filePath,
          codexHome: null
        }
      ]
    })

    await expect(
      startBacklogTask({
        sourceRoute: remoteRoute,
        targetRoute: remoteRoute,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
    ).rejects.toThrow('will not start a second writer')

    expect(mocks.launchAiVault).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('fails before persistence when a new terminal cannot launch', async () => {
    mocks.launchBackground.mockResolvedValue(null)
    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'new', agent: 'claude' },
        expectedAttemptId: null
      })
    ).rejects.toThrow('could not be started')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it.each(['exited', 'live', 'unverifiable'] as const)(
    'restores paired history only with an exited owner verdict (%s)',
    async (verdict) => {
      const pairedRoute = {
        ...route,
        executionHostId: 'runtime:owner' as const,
        runtimeEnvironmentId: 'owner'
      }
      const conversation = {
        id: 'history:claude:provider-paired',
        title: 'Paired history',
        updatedAt: null,
        surface: 'terminal' as const,
        agent: 'claude' as const,
        providerSession: { key: 'session_id' as const, id: 'provider-paired' },
        history: { filePath: '/history/paired.jsonl' }
      }
      mocks.conversations.mockResolvedValue([conversation])
      ;(window.api.aiVault.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
        sessions: [
          {
            agent: 'claude',
            sessionId: 'provider-paired',
            executionHostId: pairedRoute.executionHostId,
            filePath: conversation.history.filePath,
            codexHome: null
          }
        ]
      })
      mocks.pairedOwner.mockResolvedValue(verdict)
      mocks.launchAiVault.mockReturnValue({
        tabId: null,
        runtimeLaunch: Promise.resolve({ status: 'created' })
      })
      mocks.restoredTerminal.mockResolvedValue({
        tabId: 'paired-tab',
        leafId: 'paired-leaf',
        ptyId: 'remote:owner@@handle'
      })
      const result = startBacklogTask({
        sourceRoute: pairedRoute,
        targetRoute: pairedRoute,
        taskId: task.id,
        conversation: { kind: 'existing', conversation },
        expectedAttemptId: null
      })
      if (verdict === 'exited') {
        await expect(result).resolves.toMatchObject({ status: 'unverified' })
        expect(mocks.launchAiVault).toHaveBeenCalledWith(
          expect.objectContaining({
            runtimeEnvironmentId: 'owner',
            worktreeId: route.workspaceId
          })
        )
        expect(mocks.save).toHaveBeenCalledWith(
          pairedRoute,
          expect.objectContaining({
            terminal: expect.objectContaining({ tabId: 'paired-tab', leafId: 'paired-leaf' })
          })
        )
      } else {
        await expect(result).rejects.toThrow('will not start a second writer')
        expect(mocks.launchAiVault).not.toHaveBeenCalled()
        expect(mocks.save).not.toHaveBeenCalled()
        expect(mocks.deliver).not.toHaveBeenCalled()
      }
    }
  )

  it('rejects a cross-project target before reading the task or launching an agent', async () => {
    mocks.workspaces.mockReturnValue([])
    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: { ...route, workspaceId: 'other::/work' },
        taskId: task.id,
        conversation: { kind: 'new', agent: 'claude' },
        expectedAttemptId: null
      })
    ).rejects.toThrow('same project and execution host')
    expect(mocks.callBacklog).not.toHaveBeenCalled()
    expect(mocks.launchBackground).not.toHaveBeenCalled()
  })

  it('rejects an agent disabled after the picker opened', async () => {
    mocks.state.settings = { disabledTuiAgents: ['claude'] }
    await expect(
      startBacklogTask({
        sourceRoute: route,
        targetRoute: route,
        taskId: task.id,
        conversation: { kind: 'new', agent: 'claude' },
        expectedAttemptId: null
      })
    ).rejects.toThrow('disabled in Agent settings')
    expect(mocks.launchBackground).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
