import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeCreationRequest } from './pending-worktree-creation'

const mocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  updateWorktreeMeta: vi.fn(),
  removePendingWorktreeCreation: vi.fn(),
  activate: vi.fn(),
  ensureTerminal: vi.fn(),
  trust: vi.fn(),
  structured: vi.fn(),
  completion: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  copy: vi.fn(),
  startup: vi.fn(),
  prepare: vi.fn(),
  store: {} as Record<string, unknown>
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.store } }))
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: mocks.activate }))
vi.mock('@/lib/worktree-initial-terminal-seeding', () => ({
  ensureWorktreeHasInitialTerminal: mocks.ensureTerminal
}))
vi.mock('@/lib/agent-trust-preflight', () => ({ preflightAgentTrust: mocks.trust }))
vi.mock('@/lib/ephemeral-vm-worktree-creation', () => ({
  prepareRequestForCreate: mocks.prepare,
  attachEphemeralVmRuntimeToWorkspace: vi.fn(),
  cleanupEphemeralVmRuntimeForFailedCreate: vi.fn()
}))
vi.mock('@/lib/worktree-draft-startup-view-mode', () => ({
  resolveBackendDraftStartup: vi.fn()
}))
vi.mock('@/lib/worktree-creation-flow-startup', () => ({
  buildWorktreeCreationStartupOpt: mocks.startup
}))
vi.mock('@/lib/worktree-creation-structured-session', () => ({
  launchStructuredWorktreeSession: mocks.structured
}))
vi.mock('@/lib/worktree-creation-completion', () => ({
  completeWorktreeCreation: mocks.completion
}))
vi.mock('@/lib/worktree-creation-structured-recovery', () => ({
  markStructuredWorktreeLaunchUnconfirmed: vi.fn()
}))

import { executeWorktreeCreation } from './worktree-creation-flow-execute'

const request: WorktreeCreationRequest = {
  repoId: 'repo',
  executionHostId: 'ssh:host',
  name: 'feature/topic',
  displayName: 'My checkout',
  setupDecision: 'inherit',
  agent: 'codex',
  pendingFirstAgentMessageRename: false,
  note: 'Original note',
  startupPlan: null,
  quickPrompt: 'Original task prompt',
  launchDraftPrompt: 'Full initial prompt',
  quickTelemetry: null,
  issueCommand: { command: 'issue-setup' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.store = {
    createWorktree: mocks.createWorktree,
    updateWorktreeMeta: mocks.updateWorktreeMeta,
    removePendingWorktreeCreation: mocks.removePendingWorktreeCreation,
    pendingWorktreeCreations: { create: { request } },
    activeView: 'terminal',
    activePendingCreationId: 'create'
  }
  mocks.prepare.mockImplementation((_id, pendingRequest) => pendingRequest)
  mocks.updateWorktreeMeta.mockResolvedValue({ ok: true })
  mocks.createWorktree.mockResolvedValue({
    worktree: { id: 'wt', hostId: 'ssh:host', path: '/repo/.worktrees/feature/topic' },
    checkoutWarning: {
      kind: 'post-checkout-hook-failed',
      path: '/repo/.worktrees/feature/topic',
      message: 'post-checkout: setup-local-properties.sh: No such file or directory'
    },
    setup: { runnerScriptPath: '/tmp/setup.sh' },
    defaultTabs: { tabs: [{ command: 'dev-server' }] }
  })
  vi.stubGlobal('window', { api: { ui: { writeClipboardText: mocks.copy } } })
  mocks.copy.mockResolvedValue(undefined)
})

describe('recovered worktree creation', () => {
  it.each([undefined, 'structured-native-chat'] as const)(
    'preserves checkout and prompt without automatic startup for %s',
    async (agentLaunchRoute) => {
      await executeWorktreeCreation('create', { ...request, agentLaunchRoute })
      expect(mocks.createWorktree.mock.calls[0].at(-1)).toMatchObject({
        recoverCompletedCheckoutFailure: true
      })
      expect(mocks.updateWorktreeMeta).toHaveBeenCalledWith(
        'wt',
        {
          comment: 'Original note\n\nFull initial prompt'
        },
        { executionHostId: 'ssh:host' }
      )
      expect(mocks.activate).toHaveBeenCalledWith('wt', {
        sidebarRevealBehavior: 'auto',
        providesInitialSurface: true,
        notifyHostRuntime: false,
        executionHostId: 'ssh:host'
      })
      expect(mocks.removePendingWorktreeCreation).toHaveBeenCalledWith('create', {
        cleanupVm: false
      })
      for (const launch of [
        mocks.trust,
        mocks.ensureTerminal,
        mocks.structured,
        mocks.startup,
        mocks.completion
      ]) {
        expect(launch).not.toHaveBeenCalled()
      }
      expect(mocks.warning).toHaveBeenCalledWith(
        'Worktree created, but checkout hook failed',
        expect.objectContaining({ duration: Infinity, dismissible: true })
      )
      expect(mocks.warning.mock.calls[0][1].description).toContain(
        'Automatic setup and agent startup were paused.'
      )
      expect(mocks.warning.mock.calls[0][1].description).toContain('setup-local-properties.sh')
    }
  )

  it('does not steal activation when the user moved to another app view', async () => {
    mocks.store.activeView = 'tasks'
    await executeWorktreeCreation('create', request)
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.ensureTerminal).not.toHaveBeenCalled()
    expect(mocks.removePendingWorktreeCreation).toHaveBeenCalled()
  })

  it('keeps a copy action when prompt persistence fails', async () => {
    mocks.updateWorktreeMeta.mockResolvedValue({ ok: false, error: 'connection lost' })
    await executeWorktreeCreation('create', request)
    const options = mocks.warning.mock.calls[0][1]
    expect(options.description).toContain('could not be saved')
    const preventDefault = vi.fn()
    options.action.onClick({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(mocks.copy).toHaveBeenCalledWith('Full initial prompt')
    expect(mocks.completion).not.toHaveBeenCalled()
  })

  it('does not present an unidentified Git error as a hook failure', async () => {
    const result = await mocks.createWorktree()
    result.checkoutWarning.kind = 'git-error-after-checkout'
    await executeWorktreeCreation('create', request)
    expect(mocks.warning.mock.calls[0][0]).toBe('Worktree created, but Git reported an error')
  })
})
