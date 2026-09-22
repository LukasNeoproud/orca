// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ preview: vi.fn(), prepare: vi.fn() }))
vi.mock('@/lib/structured-conversation-branch-client', () => ({
  previewConversationBranch: mocks.preview,
  prepareConversationBranch: mocks.prepare
}))
vi.mock('@/lib/backlog-task-handoff-options', () => ({ getBacklogTaskWorkspaceOptions: () => [] }))
vi.mock('@/components/automations/WorkspaceCombobox', () => ({
  WorkspaceCombobox: ({ value }: { value: string }) => <span>{value}</span>
}))
vi.mock('@/components/new-workspace/TaskWorktreeComposer', () => ({
  TaskWorktreeComposer: () => <span>Worktree composer</span>
}))
vi.mock('@/runtime/runtime-worktree-selector', () => ({
  toRuntimeWorktreeSelector: (value: string) => value
}))
import { ConversationBranchDialog } from './ConversationBranchDialog'
import type { ConversationBranchSelection } from './conversation-branch-draft'

const selection: ConversationBranchSelection = {
  sourceSessionId: 'parent',
  epoch: 'epoch',
  itemId: 'chosen-answer',
  text: 'Selected answer',
  selectedText: 'Selected passage',
  agent: 'claude',
  target: { kind: 'environment', environmentId: 'remote-runtime' },
  route: {
    workspaceId: 'folder:project',
    executionHostId: 'local',
    runtimeEnvironmentId: 'remote-runtime'
  }
}
describe('historical branch preview and preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.preview.mockResolvedValue({
      historyPreview: 'History only through chosen answer',
      historyPreviewSha256: 'abc',
      sourceItemIds: ['chosen-answer'],
      nativeProviderForkSupported: true
    })
  })
  afterEach(cleanup)
  it('keeps manual targeted preparation available when a long history cannot be previewed', async () => {
    mocks.preview.mockResolvedValue({
      historyPreview: null,
      historyPreviewSha256: null,
      historyPreviewUnavailableReason: 'history-limit',
      sourceItemIds: ['chosen-answer'],
      nativeProviderForkSupported: true
    })
    mocks.prepare.mockResolvedValue({ branch: { branchId: 'branch', state: 'prepared' } })
    render(
      <ConversationBranchDialog
        selection={{ ...selection, selectedText: undefined }}
        onClose={vi.fn()}
        onPrepared={vi.fn()}
      />
    )
    await screen.findByText(
      'The full history exceeds the preview limit. Review and edit the targeted handoff.'
    )
    fireEvent.change(screen.getByLabelText('Exact handoff content'), {
      target: { value: 'Manually selected scope and verification.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare conversation' }))
    await screen.findByText('Conversation prepared. Work starts only when you explicitly start it.')
    expect(mocks.prepare.mock.calls[0][1].handoff).toEqual({
      mode: 'targeted',
      content: 'Manually selected scope and verification.',
      sourceItemIds: ['chosen-answer']
    })
  })
  it('prepares the exact edited targeted context without sending a turn or requiring Git', async () => {
    const prepared = vi.fn()
    mocks.prepare.mockResolvedValue({ branch: { branchId: 'branch', state: 'prepared' } })
    render(
      <ConversationBranchDialog selection={selection} onClose={vi.fn()} onPrepared={prepared} />
    )
    await act(async () => {})
    const context = '## Purpose\nFix the parser\n\n## Verification\n- [ ] Unicode regression\n'
    fireEvent.change(screen.getByLabelText('Exact handoff content'), { target: { value: context } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare conversation' }))
    await screen.findByText('Conversation prepared. Work starts only when you explicitly start it.')
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(
      selection.target,
      expect.objectContaining({
        sourceSessionId: 'parent',
        sourceItemId: 'chosen-answer',
        expectedEpoch: 'epoch',
        handoff: { mode: 'targeted', content: context, sourceItemIds: ['chosen-answer'] },
        target: { create: expect.objectContaining({ worktree: 'folder:project', agent: 'claude' }) }
      })
    )
    expect(screen.queryByRole('button', { name: 'New worktree' })).toBeNull()
    expect(prepared).toHaveBeenCalledTimes(1)
  })
  it('retains the entire operation identity after an ambiguous failure and blocks double clicks', async () => {
    let reject!: (reason: Error) => void
    mocks.prepare
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise
          })
      )
      .mockResolvedValueOnce({ branch: { branchId: 'branch', state: 'prepared' } })
    render(
      <ConversationBranchDialog selection={selection} onClose={vi.fn()} onPrepared={vi.fn()} />
    )
    await act(async () => {})
    const button = screen.getByRole('button', { name: 'Prepare conversation' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1))
    await act(async () => reject(new Error('Connection lost')))
    expect(screen.getByRole('alert').textContent).toBe('Connection lost')
    fireEvent.click(screen.getByRole('button', { name: 'Check preparation' }))
    await screen.findByText('Conversation prepared. Work starts only when you explicitly start it.')
    expect(mocks.prepare.mock.calls[1]).toEqual(mocks.prepare.mock.calls[0])
  })
})
