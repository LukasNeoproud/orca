// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import { ConversationHistorySessionRow } from './ConversationHistorySessionRow'

const mocks = vi.hoisted(() => ({ requestPortableConversationFromHistory: vi.fn() }))

vi.mock('@/lib/portable-conversation-request', () => ({
  requestPortableConversationFromHistory: mocks.requestPortableConversationFromHistory
}))

const remoteWorkspace: FolderWorkspace = {
  id: 'remote-folder',
  projectGroupId: 'project',
  name: 'Remote workspace',
  folderPath: '/remote/workspace',
  executionHostId: 'ssh:builder',
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

const session: AiVaultSession = {
  id: 'ssh:builder:codex:thread',
  executionHostId: 'ssh:builder',
  agent: 'codex',
  sessionId: 'thread',
  title: 'Remote session',
  cwd: '/remote/workspace',
  branch: null,
  model: null,
  filePath: '/remote/.codex/thread.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-09-22T12:00:00.000Z',
  messageCount: 1,
  totalTokens: 0,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: 'codex resume thread',
  subagent: null
}

function renderRow(candidate = session, worktreeId: string | null = 'remote-folder') {
  const state = useAppStore.getState()
  return render(
    <TooltipProvider>
      <ConversationHistorySessionRow
        session={candidate}
        worktree={folderWorkspaceToWorktree(remoteWorkspace)}
        worktreeInfo={
          worktreeId
            ? {
                status: 'active',
                label: 'Remote workspace',
                path: remoteWorkspace.folderPath,
                worktreeId
              }
            : null
        }
        targetState={{
          folderWorkspaces: [],
          projectGroups: [],
          repos: [],
          worktreesByRepo: {}
        }}
        settings={state.settings}
        onOpen={vi.fn()}
      />
    </TooltipProvider>
  )
}

afterEach(() => {
  cleanup()
  mocks.requestPortableConversationFromHistory.mockClear()
})

describe('ConversationHistorySessionRow portable branching', () => {
  it('opens portable branching for its resolved SSH source workspace', async () => {
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'More conversation actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Branch from response…' }))

    expect(mocks.requestPortableConversationFromHistory).toHaveBeenCalledExactlyOnceWith(
      session,
      'remote-folder'
    )
  })

  it.each([
    [{ ...session, executionHostId: 'local' }, 'remote-folder'],
    [session, null]
  ] as const)(
    'withholds the action without a supported, resolved SSH source',
    async (candidate, worktreeId) => {
      renderRow(candidate, worktreeId)
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'More conversation actions' }))
      expect(screen.queryByRole('menuitem', { name: 'Branch from response…' })).toBeNull()
    }
  )
})
