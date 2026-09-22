import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationProposalRecord } from '../../../shared/portable-conversation-proposal'
import type { StructuredTaskProposalBatchRequest } from '../../../shared/structured-task-proposal'
import {
  preparePortableTaskProposalBatch,
  type PortableTaskProposalBatchIntent
} from './portable-task-proposal-batch'
const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  confirm: vi.fn(),
  notices: vi.fn(),
  send: vi.fn()
}))
vi.mock('./portable-conversation-proposal-client', () => ({ portableProposalClient: mocks }))
vi.mock('./portable-conversation-proposal-notice-send', () => ({
  sendPortableConversationProposalNotice: mocks.send
}))
function record(): PortableConversationProposalRecord {
  const source = {
    sessionId: 'parent',
    workspaceId: 'folder:one',
    kind: 'prompt' as const,
    anchor: { epoch: 'f', itemId: 'user' },
    passages: []
  }
  return {
    schemaVersion: 1,
    revision: 1,
    state: 'offered',
    results: [],
    createdAt: 1,
    updatedAt: 1,
    proposal: {
      proposalId: 'proposal',
      source,
      shouldOffer: true,
      analysis: 'deterministic',
      truncated: false,
      items: ['one', 'two'].map((itemId) => ({
        itemId,
        branchId: itemId,
        name: itemId,
        scope: 'scope',
        verification: 'test',
        dependencyIds: [],
        workspaceId: 'folder:one',
        context: { content: 'context', sourceItemIds: ['user'] },
        relationKind: 'subtask',
        action: 'prepare',
        uncertain: false,
        intent: {
          kind: 'prepare',
          targetSessionId: `stable-${itemId}`,
          agent: 'claude',
          workspaceId: 'folder:one',
          executionHostId: 'ssh:host'
        }
      }))
    },
    portable: {
      source: {
        executionHostId: 'ssh:host',
        workspace: { id: 'folder:one', path: '/work', kind: 'folder' },
        provider: { agent: 'claude', sessionId: 'parent' },
        transcriptPath: '/history.jsonl'
      },
      anchor: {
        messageId: 'user',
        cursor: { offset: 0, fileFingerprint: 'f', boundaryCheckpoint: null },
        identity: { fingerprint: 'f', size: 10, mtimeMs: 1 }
      },
      identity: { fingerprint: 'f', size: 10, mtimeMs: 1 },
      contextSha256: 'hash',
      projectId: 'project'
    }
  }
}
function request(value: PortableConversationProposalRecord): StructuredTaskProposalBatchRequest {
  return {
    proposalId: value.proposal.proposalId,
    source: value.proposal.source,
    items: [
      {
        ...value.proposal.items[0],
        name: 'Merged result',
        context: { content: '    exact **edited** context\n', sourceItemIds: ['user'] }
      }
    ]
  }
}
function args() {
  const current = record()
  return {
    target: { kind: 'environment' as const, environmentId: 'peer' },
    record: current,
    request: request(current),
    related: new Map(),
    intent: { current: null as PortableTaskProposalBatchIntent | null },
    onRecord: vi.fn()
  }
}
describe('portable proposal confirmation lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.put.mockImplementation(async (_target, params) => ({ proposal: params.proposal }))
    mocks.confirm.mockImplementation(async (_target, params) => ({
      proposal: { ...record(), state: 'confirmed', revision: params.expectedRevision + 1 },
      batch: { items: [{ itemId: 'one', branchId: 'one', status: 'prepared' }] }
    }))
    mocks.notices.mockResolvedValue({ notices: [] })
  })
  it('persists the exact reviewed item and stable target before confirmation, without resurrecting merged items', async () => {
    const input = args()
    const result = await preparePortableTaskProposalBatch(input)
    const saved = mocks.put.mock.calls[0][1].proposal
    expect(saved.proposal.items).toHaveLength(1)
    expect(saved.proposal.items[0].context.content).toBe('    exact **edited** context\n')
    expect(saved.proposal.items[0].intent.targetSessionId).toBe('stable-one')
    expect(mocks.confirm).toHaveBeenCalledWith(input.target, {
      proposalId: 'proposal',
      expectedRevision: 2,
      itemIds: ['one']
    })
    expect(mocks.put.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.confirm.mock.invocationCallOrder[0]
    )
    expect(result.items[0].status).toBe('prepared')
  })
  it('reconciles an acknowledged durable payload after a lost put reply', async () => {
    mocks.put.mockImplementation(async (_target, params) => {
      mocks.get.mockResolvedValue({ proposal: params.proposal })
      throw new Error('reply lost')
    })
    const input = args()
    await preparePortableTaskProposalBatch(input)
    expect(mocks.get).toHaveBeenCalledWith(
      input.target,
      input.record.portable.source,
      input.record.proposal.proposalId
    )
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(input.intent.current?.draft.proposal.items[0].intent).toEqual(
      record().proposal.items[0].intent
    )
  })
  it('does not confirm changed remote content after an ambiguous save', async () => {
    mocks.put.mockRejectedValue(new Error('reply lost'))
    mocks.get.mockResolvedValue({ proposal: record() })
    await expect(preparePortableTaskProposalBatch(args())).rejects.toThrow('reply lost')
    expect(mocks.confirm).not.toHaveBeenCalled()
  })
  it('retries an immutable confirmed item without rewriting the proposal or sending an unknown notice', async () => {
    const input = args()
    input.record.state = 'confirmed'
    input.request.items = [input.record.proposal.items[0]]
    mocks.notices.mockResolvedValue({
      notices: [{ noticeId: 'saved', delivery: { status: 'unknown' } }]
    })
    await preparePortableTaskProposalBatch(input)
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.confirm).toHaveBeenCalledWith(input.target, {
      proposalId: 'proposal',
      expectedRevision: 1,
      itemIds: ['one']
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('keeps actual branch outcomes when only the source notice fails', async () => {
    mocks.notices.mockResolvedValue({ notices: [{ noticeId: 'saved', delivery: null }] })
    mocks.send.mockRejectedValue(new Error('notice disconnected'))
    const result = await preparePortableTaskProposalBatch(args())
    expect(result.items[0].status).toBe('prepared')
    expect(result.sourceNotice).toEqual({ status: 'unknown', message: 'notice disconnected' })
  })
})
