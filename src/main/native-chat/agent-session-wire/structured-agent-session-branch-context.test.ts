import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import { readAgentSessionBranchContext } from './structured-agent-session-branch-context'

const item = (
  itemId: string,
  role: 'user' | 'assistant',
  text: string,
  sequence: number
): AgentJournalRenderItem => ({
  itemId:
    role === 'user'
      ? agentJournalItemKey({ provider: 'orca', clientMessageId: itemId })
      : agentJournalItemKey({
          provider: 'codex',
          threadId: 'thread-1',
          turnId: itemId,
          ordinal: 0
        }),
  revision: 1,
  sequence,
  observedAt: sequence,
  body: { kind: 'message', role, blocks: [{ type: 'text', text }] }
})

function host(items: AgentJournalRenderItem[], epoch = 'epoch') {
  return {
    revealSession: vi.fn(async () => ({})),
    flushStreamedEvents: vi.fn(async () => undefined),
    deps: {
      store: {
        getRecord: () => ({
          provider: 'codex',
          providerHandleChain: [
            {
              linkId: 'link-1',
              handle: { provider: 'codex', threadId: 'thread-1' },
              origin: 'created',
              mintedAtFence: 1,
              observedAt: 1
            }
          ],
          location: {
            executionHostId: 'local',
            wslDistro: null,
            workspaceId: 'folder',
            workspaceKind: 'folder'
          }
        })
      },
      adapter: { supportsConversationFork: () => true }
    },
    journalSnapshot: () => ({
      sessionId: 'source-session',
      cursor: { epoch, sequence: items.length },
      items,
      submissions: []
    })
  } as unknown as StructuredAgentSessionHost
}

describe('readAgentSessionBranchContext', () => {
  it('builds the exact prefix through the selected completed assistant response', async () => {
    const context = await readAgentSessionBranchContext(
      host([
        item('u1', 'user', 'first question', 1),
        item('a1', 'assistant', 'selected answer', 2),
        item('u2', 'user', 'later decision', 3),
        item('a2', 'assistant', 'later answer', 4)
      ]),
      {
        sourceSessionId: 'source-session',
        expectedEpoch: 'epoch',
        sourceItemId: agentJournalItemKey({
          provider: 'codex',
          threadId: 'thread-1',
          turnId: 'a1',
          ordinal: 0
        })
      }
    )
    expect(context.historyPreview).toContain('selected answer')
    expect(context.historyPreview).not.toContain('later decision')
    expect(context.sourceItemIds).toEqual([
      agentJournalItemKey({ provider: 'orca', clientMessageId: 'u1' }),
      agentJournalItemKey({
        provider: 'codex',
        threadId: 'thread-1',
        turnId: 'a1',
        ordinal: 0
      })
    ])
    expect(context.excerpt).toBe('selected answer')
  })

  it('refuses a source with a running provider turn', async () => {
    const running: AgentJournalRenderItem = {
      itemId: 'status',
      revision: 1,
      sequence: 3,
      observedAt: 3,
      body: {
        kind: 'status',
        text: 'working',
        turnLifecycle: { turnId: 'turn-2', state: 'running' }
      }
    }
    await expect(
      readAgentSessionBranchContext(host([item('a1', 'assistant', 'answer', 1), running]), {
        sourceSessionId: 'source-session',
        expectedEpoch: 'epoch',
        sourceItemId: agentJournalItemKey({
          provider: 'codex',
          threadId: 'thread-1',
          turnId: 'a1',
          ordinal: 0
        })
      })
    ).rejects.toThrow('agent_session_branch_source_busy')
  })

  it('refuses an intermediate Codex message whose turn contains later output', async () => {
    const selected = item('turn-1', 'assistant', 'intermediate', 1)
    const later: AgentJournalRenderItem = {
      ...item('turn-1', 'assistant', 'final answer', 2),
      itemId: agentJournalItemKey({
        provider: 'codex',
        threadId: 'thread-1',
        turnId: 'turn-1',
        ordinal: 1
      })
    }
    await expect(
      readAgentSessionBranchContext(host([selected, later]), {
        sourceSessionId: 'source-session',
        expectedEpoch: 'epoch',
        sourceItemId: selected.itemId
      })
    ).rejects.toThrow('agent_session_branch_invalid_anchor')
  })

  it('allows a targeted user anchor while its provider turn is running', async () => {
    const running: AgentJournalRenderItem = {
      itemId: 'status',
      revision: 1,
      sequence: 2,
      observedAt: 2,
      body: {
        kind: 'status',
        text: 'working',
        turnLifecycle: { turnId: 'turn-1', state: 'running' }
      }
    }
    const userItemId = agentJournalItemKey({ provider: 'orca', clientMessageId: 'u1' })
    const context = await readAgentSessionBranchContext(
      host([item('u1', 'user', 'split this task', 1), running]),
      { sourceSessionId: 'source-session', expectedEpoch: 'epoch', sourceItemId: userItemId },
      { allowUserAnchor: true }
    )
    expect(context.excerpt).toBe('split this task')
    expect(context.nativeProviderForkSupported).toBe(false)
  })
})
