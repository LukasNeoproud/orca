import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PortableConversationBranchRecord,
  PortableConversationReturnArtifact
} from '../../../shared/portable-conversation-branch'
const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  complete: vi.fn(),
  read: vi.fn(),
  find: vi.fn(),
  send: vi.fn()
}))
vi.mock('./portable-conversation-branch-client', () => ({
  branchResultBeginPortableConversation: mocks.begin,
  branchResultCompletePortableConversation: mocks.complete
}))
vi.mock('./portable-conversation-source-client', () => ({
  readPortableConversationSession: mocks.read
}))
vi.mock('./portable-conversation-terminal-target', () => ({
  findPortableConversationTerminalTarget: mocks.find
}))
vi.mock('./active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: mocks.send,
  activeAgentNotesSendFailureMessage: (status: string) => status
}))
import { sendPortableConversationResult } from './portable-conversation-result-send'
const target = { kind: 'environment' as const, environmentId: 'owner' }
const source = { executionHostId: 'ssh:host', workspace: { id: 'folder:parent' } }
const branch = {
  branchId: 'branch',
  source: { sessionId: 'parent', portable: { source } }
} as unknown as PortableConversationBranchRecord
const artifact = {
  returnId: 'result',
  branchId: 'branch',
  targetSessionId: 'parent',
  content: '  **exact result**\n',
  portable: { attemptId: 'original' },
  delivery: null
} as unknown as PortableConversationReturnArtifact

describe('portable result durable delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.begin.mockResolvedValue({ authorized: true, result: artifact })
    mocks.read.mockResolvedValue({ sessionId: 'parent' })
    mocks.find.mockReturnValue({ tabId: 'tab', leafId: 'leaf' })
    mocks.send.mockResolvedValue({ status: 'sent' })
    mocks.complete.mockImplementation(async (_target, params) => ({
      result: { ...artifact, delivery: { status: params.status } }
    }))
  })
  it('sends saved content to the pinned parent using ordinary delivery without claiming acceptance', async () => {
    const saved = { ...artifact, content: '    verified artifact\n\n' }
    mocks.begin.mockResolvedValue({ authorized: true, result: saved })
    const result = await sendPortableConversationResult(target, branch, artifact)
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      worktreeId: 'folder:parent',
      runtimeTarget: target,
      expectedExecutionHostId: 'ssh:host',
      preserveWhitespace: true,
      noteTarget: { tabId: 'tab', leafId: 'leaf' },
      prompt: saved.content
    })
    expect(mocks.read).toHaveBeenCalledWith(target, source)
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0]
    )
    expect(result.delivery?.status).toBe('unknown')
  })
  it('observes an existing attempt without reading or sending again', async () => {
    mocks.begin.mockResolvedValue({
      authorized: false,
      result: { ...artifact, delivery: { status: 'unknown' } }
    })
    await sendPortableConversationResult(target, branch, artifact)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it.each(['disconnected', 'missing target'])(
    'records a retryable pre-send failure for %s',
    async (failure) => {
      if (failure === 'disconnected') {
        mocks.read.mockRejectedValue(new Error(failure))
      } else {
        mocks.find.mockReturnValue(null)
      }
      const result = await sendPortableConversationResult(target, branch, artifact)
      expect(result.delivery?.status).toBe('rejected')
      expect(mocks.send).not.toHaveBeenCalled()
    }
  )
  it.each(['not-ready', 'not-writable'])(
    'allows retry after ordinary delivery proves a pre-write %s refusal',
    async (status) => {
      mocks.send.mockResolvedValue({ status })
      const result = await sendPortableConversationResult(target, branch, artifact)
      expect(result.delivery?.status).toBe('rejected')
    }
  )
  it.each(['partial-submit-failed', 'status-unavailable'])(
    'does not authorize replay for an ambiguous %s outcome',
    async (status) => {
      mocks.send.mockResolvedValue({ status })
      const result = await sendPortableConversationResult(target, branch, artifact)
      expect(result.delivery?.status).toBe('unknown')
    }
  )
  it('keeps transport failure after beginning a write unknown', async () => {
    mocks.send.mockRejectedValue(new Error('reply lost'))
    const result = await sendPortableConversationResult(target, branch, artifact)
    expect(result.delivery?.status).toBe('unknown')
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('reuses the artifact identity after a lost completion reply', async () => {
    const prepared = { ...artifact, portable: { attemptId: null } }
    mocks.begin
      .mockResolvedValueOnce({ authorized: true, result: prepared })
      .mockResolvedValueOnce({
        authorized: false,
        result: { ...prepared, delivery: { status: 'unknown' } }
      })
    mocks.complete.mockRejectedValueOnce(new Error('reply lost'))
    await expect(sendPortableConversationResult(target, branch, prepared)).rejects.toThrow(
      'reply lost'
    )
    const observed = await sendPortableConversationResult(target, branch, prepared)
    expect(observed.delivery?.status).toBe('unknown')
    expect(mocks.begin.mock.calls.map(([, params]) => params.attemptId)).toEqual([
      'result',
      'result'
    ])
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('refuses a result belonging to another parent before any side effect', async () => {
    await expect(
      sendPortableConversationResult(target, branch, { ...artifact, targetSessionId: 'other' })
    ).rejects.toThrow('target_mismatch')
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
