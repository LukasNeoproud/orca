// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentSessionBranchRecord,
  AgentSessionReturnArtifact
} from '../../../../shared/agent-session-branch'

const mocks = vi.hoisted(() => ({ call: vi.fn(), envelope: vi.fn() }))
vi.mock('@/lib/structured-conversation-branch-client', () => ({
  callConversationBranch: mocks.call
}))
vi.mock('@/lib/conversation-branch-delivery', () => ({
  conversationDeliveryEnvelope: mocks.envelope
}))
vi.mock('./use-structured-agent-session-outbox', () => ({
  structuredSessionOperationId: () => '1700000000000-00000000000000000000000000000000'
}))
import { ConversationResultDialog } from './ConversationResultDialog'

const branch = {
  branchId: 'branch',
  source: { sessionId: 'parent', agent: 'claude', location: { workspaceId: 'folder:source' } }
} as AgentSessionBranchRecord
const target = { kind: 'environment' as const, environmentId: 'remote-runtime' }
function artifact(content: string, status?: 'accepted' | 'unknown'): AgentSessionReturnArtifact {
  return {
    returnId: 'return',
    branchId: 'branch',
    sourceSessionId: 'child',
    targetSessionId: 'parent',
    content,
    delivery: status ? { status, clientMessageId: 'stable-existing-id' } : null
  } as AgentSessionReturnArtifact
}

describe('return-result review and delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.envelope.mockResolvedValue({
      sessionId: 'parent',
      clientOperationId: 'stable-existing-id'
    })
  })
  afterEach(cleanup)
  it('saves the edited preview and sends exactly the immutable returned artifact', async () => {
    const text = '## Conclusion\nVerified **fix**\n- [x] regression test\n'
    mocks.call.mockImplementation(async (_target, method, params) => ({
      result: artifact(
        method.endsWith('Prepare') ? params.content : text,
        method.endsWith('Send') ? 'accepted' : undefined
      )
    }))
    render(
      <ConversationResultDialog
        branch={branch}
        target={target}
        text="Draft"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Send result' }))
    await screen.findByText('The source conversation accepted the result.')
    expect(mocks.call.mock.calls[0]).toEqual([
      target,
      'agentSession.branchResultPrepare',
      { branchId: 'branch', returnId: expect.any(String), content: text }
    ])
    expect(mocks.envelope).toHaveBeenCalledWith(target, 'parent', expect.any(String), text)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true)
    expect(mocks.call.mock.calls[1][1]).toBe('agentSession.branchResultSend')
  })
  it('blocks double clicks and never automatically retries an unknown dispatch', async () => {
    let finish!: (value: unknown) => void
    mocks.call.mockImplementation((_target, method) =>
      method.endsWith('Prepare')
        ? Promise.resolve({ result: artifact('exact') })
        : new Promise((resolve) => {
            finish = resolve
          })
    )
    render(
      <ConversationResultDialog
        branch={branch}
        target={target}
        text="Draft"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    )
    const button = screen.getByRole('button', { name: 'Send result' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2))
    await act(async () => finish({ result: artifact('exact', 'unknown') }))
    expect(mocks.call).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Result saved. Delivery is not confirmed.')).toBeTruthy()
  })
  it('reopens a durable unknown result and explicitly retries its original message identity', async () => {
    const existing = artifact('saved immutable content', 'unknown')
    mocks.call
      .mockResolvedValueOnce({ result: existing })
      .mockResolvedValueOnce({ result: artifact(existing.content, 'accepted') })
    render(
      <ConversationResultDialog
        branch={branch}
        target={target}
        text="Different current response"
        existing={existing}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    )
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(existing.content)
    fireEvent.click(screen.getByRole('button', { name: 'Check and retry delivery' }))
    await screen.findByText('The source conversation accepted the result.')
    expect(mocks.envelope).toHaveBeenCalledWith(
      target,
      'parent',
      'stable-existing-id',
      existing.content
    )
    expect(mocks.call.mock.calls[1][2]).toMatchObject({ returnId: 'return', retryUnknown: true })
  })
  it('does not resend a result already accepted before the dialog reopened', async () => {
    render(
      <ConversationResultDialog
        branch={branch}
        target={target}
        text="Draft"
        existing={artifact('saved', 'accepted')}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    )
    expect(
      (screen.getByRole('button', { name: 'Check and retry delivery' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(mocks.call).not.toHaveBeenCalled()
  })
})
