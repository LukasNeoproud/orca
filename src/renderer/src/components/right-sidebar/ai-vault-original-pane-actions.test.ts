import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

const mocks = vi.hoisted(() => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  findOriginalAiVaultSessionPane: vi.fn(),
  setActiveTabType: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(vi.fn(), {
    getState: () => ({ setActiveTabType: mocks.setActiveTabType })
  })
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace,
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('./ai-vault-original-pane', () => ({
  findOriginalAiVaultSessionPane: mocks.findOriginalAiVaultSessionPane
}))
vi.mock('./ai-vault-original-pane-index', () => ({
  createLazyAiVaultOriginalPaneIndex: vi.fn(),
  findAiVaultSessionLiveStateInIndex: vi.fn(),
  findOriginalAiVaultSessionPaneInIndex: vi.fn(),
  findRunningOriginalAiVaultSessionPaneInIndex: vi.fn(),
  getAiVaultOriginalPaneIndex: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { activateOriginalAiVaultSessionPane } from './ai-vault-original-pane-actions'

const historySession = {
  id: 'local:codex:provider-1',
  executionHostId: 'ssh:builder',
  agent: 'codex',
  sessionId: 'provider-1',
  title: 'Session',
  cwd: '/repo',
  branch: null,
  model: null,
  filePath: '/history/provider-1.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-09-15T00:00:00.000Z',
  messageCount: 1,
  totalTokens: 0,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: 'codex resume provider-1',
  subagent: null
} satisfies AiVaultSession

describe('AI Vault original pane activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.activateAndRevealFolderWorkspace.mockReturnValue({ primaryTabId: null })
    mocks.findOriginalAiVaultSessionPane.mockReturnValue({
      paneKey: 'tab-1:leaf-1',
      worktreeId: 'folder:folder-1',
      tabId: 'tab-1',
      leafId: 'leaf-1'
    })
  })

  it('activates a folder workspace on the session execution host', () => {
    expect(activateOriginalAiVaultSessionPane(historySession)).toBe('activated')
    expect(mocks.activateAndRevealFolderWorkspace).toHaveBeenCalledWith('folder-1', {
      executionHostId: 'ssh:builder'
    })
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith('tab-1', 'leaf-1', {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  })
})
