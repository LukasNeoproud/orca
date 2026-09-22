import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingWorktreeCreation, WorktreeCreationRequest } from './pending-worktree-creation'

const executeWorktreeCreation = vi.hoisted(() => vi.fn())
const pendingWorktreeCreations: Record<string, PendingWorktreeCreation> = {}
const store = {
  pendingWorktreeCreations,
  beginPendingWorktreeCreation: vi.fn((entry: PendingWorktreeCreation) => {
    pendingWorktreeCreations[entry.creationId] = entry
  }),
  setActivePendingWorktreeCreation: vi.fn(),
  setActiveView: vi.fn(),
  setSidebarOpen: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'creation-1' }))
vi.mock('@/lib/worktree-creation-flow-execute', () => ({ executeWorktreeCreation }))
vi.mock('@/lib/worktree-creation-flow-startup', () => ({
  getInitialWorktreeCreationPhase: () => 'fetching',
  getWorktreeCreationIndeterminate: () => false
}))
vi.mock('@/lib/worktree-creation-structured-recovery', () => ({
  retryStructuredWorktreeLaunch: vi.fn()
}))

import { runBackgroundWorktreeCreation } from './worktree-creation-flow'

const request: WorktreeCreationRequest = {
  repoId: 'repo-1',
  name: 'feature',
  setupDecision: 'inherit',
  agent: null,
  pendingFirstAgentMessageRename: false,
  note: '',
  startupPlan: null,
  quickPrompt: '',
  quickTelemetry: null
}

describe('background worktree creation callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete pendingWorktreeCreations['creation-1']
  })

  it('reports the created workspace id', async () => {
    const onCreated = vi.fn()
    executeWorktreeCreation.mockImplementation(
      async (
        _creationId: string,
        _request: WorktreeCreationRequest,
        callback: (id: string) => void
      ) => {
        callback('workspace-1')
      }
    )

    runBackgroundWorktreeCreation(request, { onCreated })

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith('workspace-1'))
  })

  it('reports a failed creation', async () => {
    const onFailed = vi.fn()
    executeWorktreeCreation.mockImplementation(async () => {
      pendingWorktreeCreations['creation-1'] = {
        creationId: 'creation-1',
        phase: 'creating',
        status: 'error',
        startedAt: 1,
        indeterminate: false,
        loaderVisible: true,
        request,
        error: 'create failed'
      }
    })

    runBackgroundWorktreeCreation(request, { onFailed })

    await vi.waitFor(() => expect(onFailed).toHaveBeenCalledWith('create failed'))
  })
})
