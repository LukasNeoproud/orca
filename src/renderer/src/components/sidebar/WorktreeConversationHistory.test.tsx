// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  activateFolder: vi.fn(() => ({ primaryTabId: null })),
  activateWorktree: vi.fn(() => ({ primaryTabId: null })),
  handleOpen: vi.fn(),
  requestHistory: vi.fn()
}))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mocks.activateFolder,
  activateAndRevealWorktree: mocks.activateWorktree
}))
vi.mock('../right-sidebar/ai-vault-navigation-request', () => ({
  requestAiVaultWorkspaceHistory: mocks.requestHistory
}))
vi.mock('../right-sidebar/ai-vault-session-launch-actions', () => ({
  useAiVaultSessionLaunchActions: () => ({ handleOpen: mocks.handleOpen })
}))

import { useAppStore } from '@/store'
import { resetAiVaultSessionResultCacheForTest } from '../right-sidebar/ai-vault-session-result-cache'
import { WorktreeConversationHistory } from './WorktreeConversationHistory'
import { resetConversationHistoryCatalogForTests } from './conversation-history-catalog'

const FOLDER: FolderWorkspace = {
  id: 'folder-1',
  projectGroupId: 'project-1',
  name: 'Folder one',
  folderPath: '/workspace/folder-one',
  executionHostId: 'local',
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  createdAt: 0,
  updatedAt: 0
}
const OTHER_FOLDER: FolderWorkspace = {
  ...FOLDER,
  id: 'folder-2',
  name: 'Folder two',
  folderPath: '/workspace/folder-two'
}

function session(
  title: string,
  hour: number,
  overrides: Partial<AiVaultSession> = {}
): AiVaultSession {
  const sessionId = title.toLowerCase().replaceAll(' ', '-')
  return {
    id: `codex:${sessionId}`,
    executionHostId: 'local',
    agent: 'codex',
    sessionId,
    title,
    cwd: FOLDER.folderPath,
    branch: null,
    model: null,
    filePath: `/tmp/${sessionId}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt: `2026-09-15T${String(hour).padStart(2, '0')}:00:00.000Z`,
    modifiedAt: `2026-09-15T${String(hour).padStart(2, '0')}:00:00.000Z`,
    messageCount: 1,
    totalTokens: 1,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `codex resume '${sessionId}'`,
    subagent: null,
    ...overrides
  }
}

function renderHistory(disconnected = false): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <WorktreeConversationHistory
        worktree={folderWorkspaceToWorktree(FOLDER)}
        repo={undefined}
        isSshDisconnected={false}
        isRuntimeDisconnected={disconnected}
      />
    </TooltipProvider>
  )
}

describe('WorktreeConversationHistory', () => {
  const listSessions = vi.fn()

  beforeEach(() => {
    resetConversationHistoryCatalogForTests()
    resetAiVaultSessionResultCacheForTest()
    mocks.activateFolder.mockClear()
    mocks.activateWorktree.mockClear()
    mocks.handleOpen.mockClear()
    mocks.requestHistory.mockClear()
    listSessions.mockReset()
    ;(window as unknown as { api: unknown }).api = {
      aiVault: { listSessions, onWindowFocused: () => () => undefined },
      ui: { set: vi.fn().mockResolvedValue(undefined) }
    }
    const current = useAppStore.getState()
    useAppStore.setState({
      folderWorkspaces: [FOLDER, OTHER_FOLDER],
      projectGroups: [],
      repos: [],
      worktreesByRepo: {},
      agentStatusByPaneKey: {},
      retainedAgentsByPaneKey: {},
      sleepingAgentSessionsByPaneKey: {},
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      conversationHistoryExpandedByWorkspace: {},
      settings: { ...current.settings!, agentSessionHistoryOpenMode: 'terminal' }
    })
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
  })

  it('expands a folder history into the latest five unopened rows and routes its actions', async () => {
    let resolveScan:
      | ((value: { sessions: AiVaultSession[]; issues: []; scannedAt: string }) => void)
      | undefined
    const targetSessions = Array.from({ length: 7 }, (_, index) =>
      session(`Folder session ${index + 1}`, index + 1)
    )
    listSessions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve
        })
    )
    renderHistory()

    expect(listSessions).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show full history' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Conversation History' }))
    expect(useAppStore.getState().conversationHistoryExpandedByWorkspace).toEqual({
      'local|folder:folder-1': true
    })
    expect(await screen.findByText('Loading conversations…')).toBeTruthy()
    await act(async () => {
      resolveScan?.({
        sessions: [
          ...targetSessions,
          session('Other workspace', 23, { cwd: OTHER_FOLDER.folderPath }),
          session('Other host', 22, { executionHostId: 'runtime:environment-1' }),
          session('Subagent row', 21, {
            subagent: { parentSessionId: 'parent', agentType: 'codex', status: 'completed' }
          }),
          session('Already open', 20, {
            structuredSession: { sessionId: 'open', workspaceId: 'folder:folder-1' }
          })
        ],
        issues: [],
        scannedAt: '2026-09-15T23:30:00.000Z'
      })
    })

    const visibleTitles = screen
      .getAllByText(/^Folder session /)
      .map((element) => element.textContent)
    expect(visibleTitles).toEqual([
      'Folder session 7',
      'Folder session 6',
      'Folder session 5',
      'Folder session 4',
      'Folder session 3'
    ])
    expect(screen.getAllByRole('img', { name: 'Codex' })).toHaveLength(5)
    expect(screen.queryByText('Codex')).toBeNull()
    for (const title of visibleTitles) {
      const rowButton = screen.getByText(title!).closest('button')
      expect(rowButton?.className).toContain('h-6')
      expect(rowButton?.querySelector('time')).toBeTruthy()
    }
    for (const hidden of [
      'Folder session 2',
      'Other workspace',
      'Other host',
      'Subagent row',
      'Already open'
    ]) {
      expect(screen.queryByText(hidden)).toBeNull()
    }

    await userEvent.click(screen.getByText('Folder session 7').closest('button')!)
    expect(mocks.handleOpen).toHaveBeenCalledWith(targetSessions[6], 'terminal', 'folder:folder-1')

    await userEvent.click(screen.getAllByRole('button', { name: 'More conversation actions' })[0])
    expect(screen.getByRole('menuitem', { name: 'Open in Terminal' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /^New Codex Chat/ })).toBeTruthy()
    await userEvent.keyboard('{Escape}')

    expect(screen.getAllByRole('button', { name: 'Show full history' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Show full history' }))
    expect(mocks.activateFolder).toHaveBeenCalledWith('folder-1', { executionHostId: 'local' })
    expect(mocks.requestHistory).toHaveBeenCalledWith('folder:folder-1', 'local')
  })

  it('renders the empty and error states with recovery navigation', async () => {
    useAppStore.setState({
      conversationHistoryExpandedByWorkspace: { 'local|folder:folder-1': true }
    })
    listSessions.mockResolvedValueOnce({ sessions: [], issues: [], scannedAt: 'empty' })
    const view = renderHistory()
    expect(await screen.findByText('No unopened conversations in this workspace.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show full history' })).toBeTruthy()
    view.unmount()

    resetConversationHistoryCatalogForTests()
    resetAiVaultSessionResultCacheForTest()
    listSessions.mockRejectedValueOnce(new Error('catalog failed'))
    renderHistory()
    expect(await screen.findByText(/catalog failed/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show full history' })).toBeTruthy()
  })

  it('renders disconnected without starting a scan', () => {
    useAppStore.setState({
      conversationHistoryExpandedByWorkspace: { 'local|folder:folder-1': true }
    })
    renderHistory(true)

    expect(
      screen.getByText('Connect this workspace host to load conversation history.')
    ).toBeTruthy()
    expect(listSessions).not.toHaveBeenCalled()
  })
})
