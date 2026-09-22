// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
const mocks = vi.hoisted(() => ({ requestPortableConversationFromHistory: vi.fn() }))

vi.mock('@/lib/portable-conversation-request', () => ({
  requestPortableConversationFromHistory: mocks.requestPortableConversationFromHistory
}))

import { AiVaultVirtualRow } from './AiVaultVirtualRow'

const session: AiVaultSession = {
  id: 'local:codex:thread',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'thread',
  title: 'Saved conversation',
  cwd: '/repo',
  branch: null,
  model: null,
  filePath: '/codex/thread.jsonl',
  codexHome: '/codex',
  createdAt: null,
  updatedAt: null,
  modifiedAt: new Date(0).toISOString(),
  messageCount: 2,
  totalTokens: 0,
  previewMessages: [{ role: 'assistant', text: 'Saved answer', timestamp: null }],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: 'codex resume thread',
  subagent: null
}

function renderHistory(
  mode: 'terminal' | 'structured',
  supported = true,
  options: {
    session?: AiVaultSession
    worktreeInfo?: { status: 'active'; label: string; path: string; worktreeId: string } | null
  } = {}
) {
  const rowSession = options.session ?? session
  useAppStore.setState((state) => ({
    settings: { ...state.settings, agentSessionHistoryOpenMode: mode } as NonNullable<
      typeof state.settings
    >
  }))
  const terminal = vi.fn()
  const chat = vi.fn()
  render(
    <TooltipProvider>
      <AiVaultVirtualRow
        row={{ type: 'session', groupKey: 'workspace', session: rowSession }}
        index={0}
        start={0}
        activeStickyHeaderIndex={null}
        measureElement={vi.fn()}
        collapsedGroups={new Set()}
        expandedSessionIds={new Set()}
        vaultScope="all"
        buildResumeStartup={() => ({ command: 'codex resume thread' })}
        getOriginalPaneTarget={() => null}
        getSessionLiveState={() => null}
        getWorktreeInfo={() => options.worktreeInfo ?? null}
        getSessionResumeState={() => ({
          blocked: false,
          worktreeId: 'workspace',
          usesSessionWorktree: true
        })}
        getSessionResumeActions={() => ({
          worktree: { worktreeId: 'workspace', disabled: false },
          newTab: { worktreeId: 'workspace', disabled: false }
        })}
        getSessionResumeInChat={() =>
          supported
            ? { available: true, workspaceId: 'workspace' }
            : { available: false, reason: 'remote' }
        }
        onToggleGroup={vi.fn()}
        onToggleSessionDetails={vi.fn()}
        onJumpToOriginalPane={vi.fn()}
        onJumpToWorktree={vi.fn()}
        onResume={terminal}
        onResumeInNewChat={chat}
        onContinueInNewSession={vi.fn()}
        onCopyResume={vi.fn()}
        onCopyId={vi.fn()}
        onCopyPath={vi.fn()}
        onOpenLog={vi.fn()}
        onRevealLog={vi.fn()}
        onOpenCwd={vi.fn()}
        onRequestDelete={vi.fn()}
      />
    </TooltipProvider>
  )
  return { terminal, chat }
}

afterEach(cleanup)

describe('full conversation history opening', () => {
  it.each(['terminal', 'structured'] as const)(
    'uses the %s preference for click and Enter',
    (mode) => {
      const calls = renderHistory(mode)
      const row = screen.getByRole('button', { name: /Saved conversation: Open in/ })
      fireEvent.click(screen.getByText('Saved conversation'))
      fireEvent.keyDown(row, { key: 'Enter' })
      const chosen = mode === 'terminal' ? calls.terminal : calls.chat
      const other = mode === 'terminal' ? calls.chat : calls.terminal
      expect(chosen).toHaveBeenCalledTimes(2)
      expect(chosen).toHaveBeenCalledWith(session, 'workspace')
      expect(other).not.toHaveBeenCalled()
    }
  )

  it('offers both explicit modes independently of the preferred mode', async () => {
    const calls = renderHistory('structured')
    const user = userEvent.setup()
    await user.click(screen.getByTestId('ai-vault-session-more-actions'))
    expect(await screen.findByRole('menuitem', { name: 'Open in Codex Chat' })).toBeTruthy()
    await user.click(screen.getByRole('menuitem', { name: 'Open in Terminal' }))
    expect(calls.terminal).toHaveBeenCalledExactlyOnceWith(session, 'workspace')
    expect(calls.chat).not.toHaveBeenCalled()
  })

  it('branches verified SSH history through its resolved source workspace', async () => {
    const remoteSession: AiVaultSession = {
      ...session,
      id: 'ssh:build:codex:thread',
      executionHostId: 'ssh:build',
      cwd: '/remote/repo'
    }
    renderHistory('terminal', true, {
      session: remoteSession,
      worktreeInfo: {
        status: 'active',
        label: 'remote worktree',
        path: '/remote/repo',
        worktreeId: 'remote-worktree'
      }
    })
    const user = userEvent.setup()

    await user.click(screen.getByTestId('ai-vault-session-more-actions'))
    await user.click(await screen.findByRole('menuitem', { name: 'Branch from response…' }))

    expect(mocks.requestPortableConversationFromHistory).toHaveBeenCalledExactlyOnceWith(
      remoteSession,
      'remote-worktree'
    )
  })

  it('does not offer portable branching for local or workspace-unresolved history', async () => {
    const user = userEvent.setup()
    renderHistory('terminal', true, {
      worktreeInfo: {
        status: 'active',
        label: 'local worktree',
        path: '/repo',
        worktreeId: 'active-worktree'
      }
    })

    await user.click(screen.getByTestId('ai-vault-session-more-actions'))
    expect(screen.queryByRole('menuitem', { name: 'Branch from response…' })).toBeNull()
  })

  it('explains unsupported chat and never substitutes a terminal launch', async () => {
    const calls = renderHistory('structured', false)
    const row = screen.getByRole('button', { name: /Saved conversation: Open in/ })
    expect(row.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('ai-vault-session-more-actions'))
    const disabledChat = await screen.findByRole('menuitem', {
      name: /Open in Codex Chat\./
    })
    expect(disabledChat.getAttribute('aria-disabled')).toBe('true')
    expect(calls.terminal).not.toHaveBeenCalled()
    expect(calls.chat).not.toHaveBeenCalled()
  })
})
