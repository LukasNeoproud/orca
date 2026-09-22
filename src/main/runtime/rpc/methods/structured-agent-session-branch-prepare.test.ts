import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionBranchRecord } from '../../../../shared/agent-session-branch'
import { structuredAgentSessionCreateParams } from '../../../../shared/structured-agent-session-create'
import { prepareAgentSessionBranch } from './structured-agent-session-branch-prepare'

const mocks = vi.hoisted(() => ({
  host: null as unknown,
  prepareCreate: vi.fn(),
  commitCreate: vi.fn(),
  buildBranch: vi.fn(),
  sameBranch: vi.fn(() => true)
}))

vi.mock('./structured-agent-session-branch-gate', () => ({
  requireBranchCapability: vi.fn()
}))
vi.mock('./structured-agent-session-gate', () => ({
  ensureStructuredHostInstalled: vi.fn(async () => undefined),
  requireStructuredHost: vi.fn(() => mocks.host),
  structuredCallerFor: vi.fn(() => ({ callerKey: 'test' }))
}))
vi.mock('./structured-agent-session-create', () => ({
  prepareStructuredAgentSessionCreateForWorktree: mocks.prepareCreate,
  commitStructuredAgentSessionCreate: mocks.commitCreate
}))
vi.mock('../../../native-chat/agent-session-wire/structured-agent-session-branch-service', () => ({
  buildPreparedAgentSessionBranch: mocks.buildBranch,
  samePreparedAgentSessionBranch: mocks.sameBranch
}))

const location = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'folder-1',
  workspaceKind: 'folder'
} as const

function record(
  create: ReturnType<typeof structuredAgentSessionCreateParams>
): AgentSessionBranchRecord {
  return {
    schemaVersion: 1,
    branchId: 'branch-1',
    title: 'Child',
    relationKind: 'subtask',
    dependsOnBranchIds: [],
    source: {
      sessionId: 'source-1',
      agent: 'codex',
      location,
      anchor: { epoch: 'epoch-1', itemId: 'codex:source:turn:0' },
      excerpt: 'answer'
    },
    target: { sessionId: 'codex_target', agent: 'codex', location, create },
    handoff: {
      mode: 'preserve-history',
      mechanism: 'native-provider-fork',
      content: 'Investigate this.',
      contentSha256: 'a'.repeat(64),
      sourceItemIds: ['codex:source:turn:0'],
      historyPreview: 'ASSISTANT:\nanswer',
      historyPreviewSha256: 'b'.repeat(64)
    },
    providerFork: {
      sourceProviderSessionId: 'source',
      targetProviderSessionId: 'forked-target',
      boundaryItemId: 'codex:source:turn:0'
    },
    state: 'failed',
    delivery: null,
    error: 'tab publication unknown',
    createdAt: 1,
    updatedAt: 2
  }
}

describe('prepareAgentSessionBranch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reuses a proven provider fork after a failed target attach', async () => {
    const clientCreate = structuredAgentSessionCreateParams({
      sessionId: 'codex_target',
      worktree: 'folder:folder-1',
      agent: 'codex',
      randomUuid: () => '11111111-1111-4111-8111-111111111111',
      now: 1_800_000_000_000
    })
    const resumedCreate = {
      ...clientCreate,
      resumeFrom: { providerSessionId: 'forked-target' }
    }
    let persisted = record(resumedCreate)
    const forkConversation = vi.fn()
    const store = {
      get: () => persisted,
      put: vi.fn(async (next: AgentSessionBranchRecord) => {
        persisted = next
        return next
      }),
      runExclusive: vi.fn(async (_key: string, run: () => Promise<unknown>) => run())
    }
    mocks.host = {
      deps: { branchStore: store, adapter: { forkConversation } },
      hold: vi.fn(),
      release: vi.fn()
    }
    mocks.prepareCreate.mockResolvedValue({
      host: mocks.host,
      attachParams: { location },
      tab: null
    })
    mocks.commitCreate.mockResolvedValue({ ok: true, value: { sessionId: 'codex_target' } })
    mocks.buildBranch.mockResolvedValue(record(clientCreate))

    const result = await prepareAgentSessionBranch(
      {
        branchId: 'branch-1',
        title: 'Child',
        sourceSessionId: 'source-1',
        expectedEpoch: 'epoch-1',
        sourceItemId: 'codex:source:turn:0',
        relationKind: 'subtask',
        target: { create: clientCreate },
        handoff: {
          mode: 'preserve-history',
          instruction: 'Investigate this.',
          historyPreviewSha256: 'b'.repeat(64)
        }
      },
      { runtime: {} } as never
    )

    expect(forkConversation).not.toHaveBeenCalled()
    expect(mocks.prepareCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ resumeFrom: { providerSessionId: 'forked-target' } })
    )
    expect(result.branch.state).toBe('prepared')
  })
})
