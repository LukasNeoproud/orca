// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationBranchPreviewResult } from '../../../../shared/portable-conversation-branch'
import type { PortableConversationSourceSelection } from './PortableConversationSourceDialog'
import { PortableConversationBranchDialog } from './PortableConversationBranchDialog'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), prepare: vi.fn() }))

vi.mock('@/lib/portable-conversation-branch-client', () => ({
  branchPreviewPortableConversation: mocks.preview,
  branchPreparePortableConversation: mocks.prepare
}))
vi.mock('@/lib/backlog-task-handoff-options', () => ({
  getBacklogTaskWorkspaceOptions: () => [{ id: 'worktree-a' }]
}))
vi.mock('./ConversationBranchTargetFields', () => ({
  ConversationBranchTargetFields: () => <div>Branch target fields</div>
}))
vi.mock('@/components/new-workspace/TaskWorktreeComposer', () => ({
  TaskWorktreeComposer: () => <div>Worktree composer</div>
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const selection: PortableConversationSourceSelection = {
  source: {
    executionHostId: 'ssh:host-a',
    workspace: { id: 'worktree-a', path: '/srv/project', kind: 'git-worktree' },
    provider: { agent: 'codex', sessionId: 'provider-a' },
    transcriptPath: '/home/ada/.codex/sessions/provider-a.jsonl'
  },
  anchor: {
    messageId: 'assistant-1',
    cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'fingerprint-a' },
    identity: { fingerprint: 'fingerprint-a', size: 100, mtimeMs: 1 }
  },
  message: {
    id: 'assistant-1',
    role: 'assistant',
    blocks: [{ type: 'text', text: 'Source response' }],
    timestamp: null,
    source: 'transcript'
  }
}

function preview(
  mode: 'history' | 'targeted',
  historyTruncated = false
): PortableConversationBranchPreviewResult {
  return {
    contextSha256: `${mode}-hash`,
    context: {
      source: selection.source,
      anchor: selection.anchor,
      identity: selection.anchor.identity,
      verification: {
        cursor: selection.anchor.cursor,
        selectedMessageId: selection.anchor.messageId
      },
      selectedPassage: 'Source response',
      contextMarkdown: `${mode} context`,
      historyTruncated,
      warnings: []
    }
  }
}

function renderDialog(onPrepared = vi.fn(), selected = selection) {
  render(
    <PortableConversationBranchDialog
      selection={selected}
      target={{ kind: 'local' }}
      sourceRoute={{
        workspaceId: 'worktree-a',
        executionHostId: 'ssh:host-a',
        runtimeEnvironmentId: null
      }}
      onClose={vi.fn()}
      onPrepared={onPrepared}
    />
  )
  return onPrepared
}

describe('PortableConversationBranchDialog', () => {
  it('prepares an editable portable history copy without starting work', async () => {
    mocks.preview.mockResolvedValue(preview('history'))
    mocks.prepare.mockResolvedValue({ branch: { branchId: 'branch-a', state: 'prepared' } })
    const onPrepared = renderDialog()

    await screen.findByDisplayValue('history context')
    expect(screen.getByText(/The agent will use the current files/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Exact editable portable context'), {
      target: { value: 'Edited portable context' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare conversation' }))

    await screen.findByText('Conversation prepared. Work starts only when you explicitly start it.')
    expect(mocks.prepare).toHaveBeenCalledWith(
      { kind: 'local' },
      expect.objectContaining({
        source: selection.source,
        anchor: selection.anchor,
        target: expect.objectContaining({
          agent: 'codex',
          workspaceId: 'worktree-a',
          executionHostId: 'ssh:host-a'
        }),
        handoff: {
          mode: 'history',
          content: 'Edited portable context',
          sourceContextSha256: 'history-hash'
        }
      })
    )
    expect(onPrepared).toHaveBeenCalledTimes(1)
  })

  it('refuses truncated history and loads a targeted portable copy instead', async () => {
    mocks.preview
      .mockResolvedValueOnce(preview('history', true))
      .mockResolvedValueOnce(preview('targeted'))
    mocks.prepare.mockResolvedValue({ branch: { branchId: 'branch-a', state: 'prepared' } })
    renderDialog()

    await screen.findByText(
      'The full portable history is bounded, so it cannot be prepared as preserved history. Review the targeted copy instead.'
    )
    expect(await screen.findByDisplayValue(/## Purpose and scope/)).toBeInTheDocument()
    const handoff = (screen.getByRole('textbox') as HTMLTextAreaElement).value
    expect(handoff).toContain('## Accepted decisions')
    expect(handoff).toContain('targeted context')
    expect(handoff).toContain('## Expected verification')
    fireEvent.click(screen.getByRole('button', { name: 'Prepare conversation' }))
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1))
    expect(mocks.prepare.mock.calls[0]?.[1].handoff.mode).toBe('targeted')
  })

  it('offers a new worktree only for a Git worktree source', async () => {
    mocks.preview.mockResolvedValue(preview('history'))
    renderDialog(vi.fn(), {
      ...selection,
      source: { ...selection.source, workspace: { ...selection.source.workspace, kind: 'folder' } }
    })

    await screen.findByDisplayValue('history context')
    expect(screen.queryByRole('button', { name: 'New worktree' })).toBeNull()
  })

  it('retries the exact immutable preparation after an ambiguous failure', async () => {
    mocks.preview.mockResolvedValue(preview('history'))
    let reject!: (error: Error) => void
    mocks.prepare
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise
          })
      )
      .mockResolvedValueOnce({ branch: { branchId: 'branch-a', state: 'prepared' } })
    renderDialog()

    await screen.findByDisplayValue('history context')
    fireEvent.click(screen.getByRole('button', { name: 'Prepare conversation' }))
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1))
    await act(async () => reject(new Error('Connection lost')))
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    fireEvent.click(screen.getByRole('button', { name: 'Check preparation' }))
    await screen.findByText('Conversation prepared. Work starts only when you explicitly start it.')
    expect(mocks.prepare.mock.calls[1]).toEqual(mocks.prepare.mock.calls[0])
  })
})
