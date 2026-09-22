// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'

const mocks = vi.hoisted(() => ({
  readProposal: vi.fn(),
  readNotices: vi.fn(),
  readPreference: vi.fn(),
  writeProposal: vi.fn(),
  writePreference: vi.fn(),
  prepareBatch: vi.fn()
}))
vi.mock('@/lib/structured-conversation-branch-client', () => ({
  readConversationBranchProposal: mocks.readProposal,
  readConversationBranchNotices: mocks.readNotices,
  readConversationBranchSuggestionPreference: mocks.readPreference,
  writeConversationBranchProposal: mocks.writeProposal,
  writeConversationBranchSuggestionPreference: mocks.writePreference
}))
vi.mock('@/lib/structured-task-proposal-batch', () => ({
  prepareStructuredTaskProposalBatch: mocks.prepareBatch
}))

import { useStructuredTaskProposals } from './use-structured-task-proposals'

const message = (
  itemId: string,
  sequence: number,
  role: 'user' | 'assistant',
  text: string
): AgentJournalRenderItem => ({
  itemId,
  sequence,
  revision: 1,
  observedAt: sequence,
  body: { kind: 'message', role, blocks: [{ type: 'text', text }] }
})
const base = {
  target: { kind: 'local' } as const,
  sessionId: 'source',
  workspaceId: 'workspace',
  agent: 'codex' as const,
  epoch: 'epoch',
  isWorking: true,
  visible: true,
  family: { branches: [], returns: [] },
  refreshFamily: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  let uuid = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
  })
  mocks.readProposal.mockResolvedValue({ proposal: null })
  mocks.readNotices.mockResolvedValue({ notices: [] })
  mocks.readPreference.mockResolvedValue({ enabled: true, source: 'default' })
  mocks.writeProposal.mockImplementation((_target, input) =>
    Promise.resolve({
      proposal: {
        ...input.proposal,
        sourceLocation: {
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'workspace',
          workspaceKind: 'git-worktree'
        }
      }
    })
  )
})
afterEach(cleanup)

describe('useStructuredTaskProposals', () => {
  it('offers a multi-outcome prompt while its normal turn is still running', async () => {
    const items = [message('user', 1, 'user', '- Add invoice export.\n- Fix OAuth refresh.')]
    const { result } = renderHook(() => useStructuredTaskProposals({ ...base, items }))
    await waitFor(() => expect(mocks.writeProposal).toHaveBeenCalledTimes(1))
    expect(mocks.writeProposal.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 0,
      proposal: { state: 'offered', sourceAnchor: { itemId: 'user' } }
    })
    expect(result.current.proposal?.items).toHaveLength(2)
  })

  it('does not offer file-shaped layers of one outcome', async () => {
    const items = [
      message(
        'user',
        1,
        'user',
        '- Add invoice filtering API.\n- Build invoice filtering UI.\n- Test invoice filtering.'
      )
    ]
    renderHook(() => useStructuredTaskProposals({ ...base, items }))
    await waitFor(() => expect(mocks.readPreference).toHaveBeenCalled())
    await act(async () => {})
    expect(mocks.writeProposal).not.toHaveBeenCalled()
  })

  it('keeps automatic suggestions disabled while manual analysis remains available', async () => {
    mocks.readPreference.mockResolvedValue({ enabled: false, source: 'session' })
    const items = [message('user', 1, 'user', '- Add export.\n- Fix login.')]
    const { result } = renderHook(() => useStructuredTaskProposals({ ...base, items }))
    await waitFor(() => expect(result.current.automatic).toBe(false))
    expect(mocks.writeProposal).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.analyze()
    })
    expect(mocks.writeProposal).toHaveBeenCalledTimes(1)
    expect(result.current.editorOpen).toBe(true)
  })

  it('does not re-offer a dismissed durable proposal until manual invocation', async () => {
    const items = [message('user', 1, 'user', '- Add export.\n- Fix login.')]
    const candidate = {
      schemaVersion: 1 as const,
      proposalId: 'saved',
      sourceSessionId: 'source',
      sourceAnchor: { epoch: 'epoch', itemId: 'user' },
      revision: 2,
      state: 'dismissed' as const,
      items: [],
      createdAt: 1,
      updatedAt: 2
    }
    mocks.readProposal.mockResolvedValue({ proposal: candidate })
    const { result } = renderHook(() => useStructuredTaskProposals({ ...base, items }))
    await waitFor(() => expect(result.current.proposalState).toBe('dismissed'))
    expect(mocks.writeProposal).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.analyze()
    })
    expect(mocks.writeProposal.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 2,
      proposal: { state: 'offered', revision: 3 }
    })
  })
})
