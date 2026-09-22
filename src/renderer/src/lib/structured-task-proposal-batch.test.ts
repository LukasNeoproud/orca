import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
import type { AgentSessionBranchProposal } from '../../../shared/agent-session-branch-proposal'

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  prepare: vi.fn(),
  prepareNotice: vi.fn(),
  family: vi.fn(),
  sendNotice: vi.fn(),
  envelope: vi.fn()
}))
vi.mock('./structured-conversation-branch-client', () => ({
  attachConversationBranch: mocks.attach,
  prepareConversationBranch: mocks.prepare,
  prepareConversationBranchNotice: mocks.prepareNotice,
  readConversationFamily: mocks.family,
  sendConversationBranchNotice: mocks.sendNotice
}))
vi.mock('./conversation-branch-delivery', () => ({ conversationDeliveryEnvelope: mocks.envelope }))

import { prepareStructuredTaskProposalBatch } from './structured-task-proposal-batch'

const target = { kind: 'local' } as const
const record: AgentSessionBranchProposal = {
  schemaVersion: 1,
  proposalId: 'proposal',
  sourceSessionId: 'source',
  sourceAnchor: { epoch: 'epoch', itemId: 'source-item' },
  revision: 2,
  state: 'confirmed',
  createdAt: 1,
  updatedAt: 2,
  items: [
    {
      itemId: 'new',
      branchId: 'branch-new',
      title: 'New work',
      scope: 'Implement it.',
      verification: 'Test it.',
      uncertain: false,
      dependencyIds: [],
      workspaceId: 'workspace',
      context: 'Focused context.',
      sourceItemIds: ['source-item'],
      action: {
        kind: 'prepare',
        targetCreate: {
          envelope: {
            sessionId: 'codex_child',
            clientOperationId: 'create-op',
            expectedRuntimeFence: null,
            payloadFingerprint: 'fingerprint'
          },
          worktree: 'workspace',
          agent: 'codex'
        }
      }
    },
    {
      itemId: 'attach',
      branchId: 'branch-attach',
      title: 'Existing work',
      scope: 'Link it.',
      verification: 'Review it.',
      uncertain: false,
      dependencyIds: ['new'],
      workspaceId: 'workspace',
      context: 'Existing context.',
      sourceItemIds: ['source-item'],
      action: { kind: 'attach', targetSessionId: 'existing' }
    }
  ]
}
const request = {
  proposalId: 'proposal',
  source: {
    sessionId: 'source',
    workspaceId: 'workspace',
    kind: 'prompt' as const,
    anchor: { epoch: 'epoch', itemId: 'source-item' },
    passages: []
  },
  items: record.items.map((item) => ({
    itemId: item.itemId,
    branchId: item.branchId,
    name: item.title,
    scope: item.scope,
    verification: item.verification,
    dependencyIds: item.dependencyIds,
    workspaceId: item.workspaceId,
    context: { content: item.context, sourceItemIds: item.sourceItemIds },
    relationKind: 'subtask' as const,
    action: item.action.kind,
    ...(item.action.kind === 'attach' ? { targetSessionId: item.action.targetSessionId } : {})
  }))
}

const branch = (branchId: string, sessionId: string) => ({
  branchId,
  state: 'prepared',
  target: { sessionId },
  error: null
})
const notice = (branchId: string, status: 'accepted' | 'unknown' | null = null) => ({
  notice: {
    noticeId: `${branchId}-source-notice`,
    sourceSessionId: 'source',
    branchIds: [branchId],
    content: 'notice',
    contentSha256: 'hash',
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    delivery: status
      ? { clientMessageId: 'notice-op', status, reason: null, submittedAt: 1, resolvedAt: 1 }
      : null
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
  mocks.family.mockResolvedValue({ branches: [], returns: [] })
  mocks.envelope.mockResolvedValue({
    sessionId: 'source',
    clientOperationId: 'notice-op',
    expectedRuntimeFence: 1,
    payloadFingerprint: 'send'
  })
  mocks.prepareNotice.mockImplementation((_target, params) =>
    Promise.resolve(notice(params.branchIds[0]))
  )
  mocks.sendNotice.mockImplementation((_target, params) =>
    Promise.resolve(notice(params.noticeId.replace('-source-notice', ''), 'accepted'))
  )
})

describe('structured task proposal batch', () => {
  it('prepares and attaches independently, preserving actual partial results', async () => {
    mocks.prepare.mockResolvedValue({ branch: branch('branch-new', 'codex_child') })
    mocks.attach.mockRejectedValue(
      new RuntimeRpcCallError({
        id: 'rpc-1',
        ok: false,
        error: { code: 'invalid_request', message: 'Target is unavailable' }
      })
    )
    const result = await prepareStructuredTaskProposalBatch({ target, proposal: record, request })
    expect(result.items).toMatchObject([
      { itemId: 'new', status: 'prepared' },
      { itemId: 'attach', status: 'failed', message: 'Target is unavailable' }
    ])
    expect(mocks.prepare).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        dependsOnBranchIds: [],
        handoff: expect.objectContaining({ mode: 'targeted' })
      })
    )
    expect(mocks.prepareNotice).toHaveBeenCalledTimes(1)
    expect(result.sourceNotice?.status).toBe('accepted')
  })

  it('does not notify or silently replay an ambiguous branch preparation', async () => {
    mocks.prepare.mockRejectedValue(new Error('connection lost'))
    const result = await prepareStructuredTaskProposalBatch({
      target,
      proposal: { ...record, items: [record.items[0]!] },
      request: { ...request, items: [request.items[0]!] }
    })
    expect(result.items[0]).toMatchObject({ status: 'unknown', message: 'connection lost' })
    expect(mocks.prepareNotice).not.toHaveBeenCalled()
  })

  it('recovers an existing branch before retrying and reuses an unknown notice operation', async () => {
    mocks.family.mockResolvedValue({ branches: [branch('branch-new', 'codex_child')], returns: [] })
    mocks.prepareNotice.mockResolvedValue(notice('branch-new', 'unknown'))
    mocks.sendNotice.mockResolvedValue(notice('branch-new', 'accepted'))
    const result = await prepareStructuredTaskProposalBatch({
      target,
      proposal: { ...record, items: [record.items[0]!] },
      request: { ...request, items: [request.items[0]!] }
    })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.sendNotice).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        envelope: expect.objectContaining({ clientOperationId: 'notice-op' }),
        retryUnknown: true
      })
    )
    expect(result.items[0]?.status).toBe('prepared')
  })

  it('explicitly retries a failed targeted preparation with its persisted create intent', async () => {
    mocks.family.mockResolvedValue({
      branches: [{ ...branch('branch-new', 'codex_child'), state: 'failed', providerFork: null }],
      returns: []
    })
    mocks.prepare.mockResolvedValue({ branch: branch('branch-new', 'codex_child') })
    const result = await prepareStructuredTaskProposalBatch({
      target,
      proposal: { ...record, items: [record.items[0]!] },
      request: { ...request, items: [request.items[0]!] }
    })
    expect(mocks.prepare).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        target: {
          create:
            record.items[0]!.action.kind === 'prepare'
              ? record.items[0]!.action.targetCreate
              : undefined
        }
      })
    )
    expect(result.items[0]?.status).toBe('prepared')
  })
})
