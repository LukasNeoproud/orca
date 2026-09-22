// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PortableConversationBranchRecord,
  PortableConversationReturnArtifact
} from '../../../../shared/portable-conversation-branch'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/portable-conversation-branch-client', () => ({
  branchResultPreparePortableConversation: mocks.prepare
}))
vi.mock('@/lib/portable-conversation-result-send', () => ({
  sendPortableConversationResult: mocks.send
}))
import { PortableConversationResultDialog } from './PortableConversationResultDialog'

const branch = {
  branchId: 'branch',
  source: {
    sessionId: 'parent',
    agent: 'codex',
    portable: {
      source: {
        executionHostId: 'ssh:builder',
        provider: { agent: 'codex', sessionId: 'parent-provider-session' },
        workspace: { id: 'folder:parent', path: '/work', kind: 'folder' }
      }
    }
  }
} as unknown as PortableConversationBranchRecord
const target = { kind: 'environment' as const, environmentId: 'remote-runtime' }

function artifact(
  content: string,
  status?: 'accepted' | 'rejected' | 'unknown' | 'pending'
): PortableConversationReturnArtifact {
  return {
    returnId: 'return',
    branchId: 'branch',
    sourceSessionId: 'child',
    targetSessionId: 'parent',
    content,
    delivery: status ? { status, clientMessageId: 'attempt' } : null,
    portable: { attemptId: status ? 'attempt' : null }
  } as PortableConversationReturnArtifact
}

function renderDialog(onSaved = vi.fn(), existingArtifact?: PortableConversationReturnArtifact) {
  render(
    <PortableConversationResultDialog
      branch={branch}
      target={target}
      existingArtifact={existingArtifact}
      onClose={vi.fn()}
      onSaved={onSaved}
    />
  )
  return onSaved
}

describe('PortableConversationResultDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('prepares the edited immutable result before an explicit send', async () => {
    const content = '## Result\nVerified the remote change.'
    const saved = artifact(content)
    mocks.prepare.mockResolvedValue({ result: saved })
    const onSaved = renderDialog()
    expect(screen.getByText(/parent-provider-session/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: content } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))

    await screen.findByText('Result prepared. Review the exact text, then send it.')
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(target, {
      branchId: 'branch',
      returnId: expect.any(String),
      content
    })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true)
  })

  it('locks the exact attempt after a lost preparation reply and retries its same identity', async () => {
    const content = '  Exact reviewed result\n'
    mocks.prepare
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ result: artifact(content) })
    renderDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: content } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true)
    const first = mocks.prepare.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))
    await screen.findByRole('button', { name: 'Send result' })
    expect(mocks.prepare.mock.calls[1][1]).toEqual(first)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(content)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('sends only the prepared result and records its terminal outcome', async () => {
    const content = 'Exact result'
    const prepared = artifact(content)
    const accepted = artifact(content, 'accepted')
    mocks.prepare.mockResolvedValue({ result: prepared })
    mocks.send.mockResolvedValue(accepted)
    const onSaved = renderDialog()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: content } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))
    await screen.findByRole('button', { name: 'Send result' })
    fireEvent.click(screen.getByRole('button', { name: 'Send result' }))

    await screen.findByText('The source conversation accepted the result.')
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(target, branch, prepared)
    expect(onSaved).toHaveBeenNthCalledWith(1, prepared)
    expect(onSaved).toHaveBeenNthCalledWith(2, accepted)
  })

  it('reopens a saved rejected result with its original immutable identity', async () => {
    const rejected = artifact('Saved exact result', 'rejected')
    const accepted = artifact(rejected.content, 'accepted')
    mocks.send.mockResolvedValue(accepted)
    const onSaved = renderDialog(vi.fn(), rejected)

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(rejected.content)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry delivery' }))

    await screen.findByText('The source conversation accepted the result.')
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(target, branch, rejected)
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(accepted)
  })

  it('reopens an unknown result without offering a second send', () => {
    renderDialog(vi.fn(), artifact('Saved exact result', 'unknown'))

    const send = screen.getByRole('button', { name: 'Send result' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('does not automatically retry an unknown delivery', async () => {
    const prepared = artifact('Exact result')
    const unknown = artifact('Exact result', 'unknown')
    mocks.prepare.mockResolvedValue({ result: prepared })
    mocks.send.mockResolvedValue(unknown)
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))
    await screen.findByRole('button', { name: 'Send result' })
    fireEvent.click(screen.getByRole('button', { name: 'Send result' }))
    await screen.findByText('Result saved. Delivery is not confirmed.')
    const send = screen.getByRole('button', { name: 'Send result' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
  })

  it('allows an explicit retry only after a provable rejection', async () => {
    const prepared = artifact('Exact result')
    const rejected = artifact('Exact result', 'rejected')
    mocks.prepare.mockResolvedValue({ result: prepared })
    mocks.send.mockResolvedValue(rejected)
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare result' }))
    await screen.findByRole('button', { name: 'Send result' })
    fireEvent.click(screen.getByRole('button', { name: 'Send result' }))
    await screen.findByText(
      'Delivery was rejected before the source received the result. You can retry.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry delivery' }))

    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
  })
})
