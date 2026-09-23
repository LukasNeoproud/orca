import { describe, expect, it } from 'vitest'
import { agentJournalItemKey } from '../../../src/shared/agent-session-journal-item-key'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import type {
  AgentSessionBranchPreviewResult,
  AgentSessionBranchRecord
} from '../../../src/shared/agent-session-branch'
import {
  buildMobileConversationBranchIntent,
  initialMobileConversationBranchDraft,
  mobileConversationBranchableItemIds,
  mobileConversationBranchStateLabel
} from './mobile-conversation-branch-model'
import {
  readMobileConversationBranchIntent,
  retainMobileConversationBranchIntent
} from './mobile-conversation-branch-intent-registry'

function message(itemId: string, role: 'assistant' | 'user'): AgentJournalRenderItem {
  return {
    itemId,
    revision: 1,
    sequence: 1,
    observedAt: 1,
    body: { kind: 'message', role, blocks: [{ type: 'text', text: role }] }
  }
}

const preview: AgentSessionBranchPreviewResult = {
  sourceLocation: {
    executionHostId: 'local',
    wslDistro: null,
    workspaceId: 'repo::/worktree',
    workspaceKind: 'git-worktree'
  },
  sourceAgent: 'codex',
  historyPreview: 'history',
  historyPreviewSha256: 'a'.repeat(64),
  sourceItemIds: ['item'],
  nativeProviderForkSupported: true
}

describe('mobile conversation branch model', () => {
  it('exposes only exact completed provider response boundaries', () => {
    const first = agentJournalItemKey({
      provider: 'codex',
      threadId: 't',
      turnId: 'turn',
      ordinal: 0
    })
    const last = agentJournalItemKey({
      provider: 'codex',
      threadId: 't',
      turnId: 'turn',
      ordinal: 1
    })
    const claude = agentJournalItemKey({ provider: 'claude', sessionId: 's', uuid: 'u' })
    const ids = mobileConversationBranchableItemIds([
      message(first, 'assistant'),
      { ...message(last, 'assistant'), sequence: 2 },
      { ...message(claude, 'assistant'), sequence: 3 },
      { ...message('legacy:codex:s:r', 'assistant'), sequence: 4 }
    ])
    expect([...ids]).toEqual([last, claude])
  })

  it('offers no boundary while any root turn is running', () => {
    const assistant = agentJournalItemKey({ provider: 'claude', sessionId: 's', uuid: 'u' })
    expect(
      mobileConversationBranchableItemIds([
        message(assistant, 'assistant'),
        {
          itemId: 'status',
          revision: 1,
          sequence: 2,
          observedAt: 2,
          body: {
            kind: 'status',
            text: 'Running',
            turnLifecycle: { turnId: 'turn', state: 'running' }
          }
        }
      ]).size
    ).toBe(0)
  })

  it('copies the reviewed history fingerprint into one immutable prepare intent', () => {
    const draft = initialMobileConversationBranchDraft({
      responseText: 'Review this result',
      sourceWorkspaceId: 'repo::/worktree',
      preview
    })
    const key = `test-${Math.random()}`
    const first = retainMobileConversationBranchIntent(key, () =>
      buildMobileConversationBranchIntent({
        sourceSessionId: 'codex_source',
        epoch: 'epoch-1',
        sourceItemId: 'item',
        preview,
        draft
      })
    )
    const second = retainMobileConversationBranchIntent(key, () => {
      throw new Error('must not rebuild')
    })
    expect(second).toBe(first)
    expect(first.handoff).toEqual({
      mode: 'preserve-history',
      instruction: 'Continue this response as a separate task.',
      historyPreviewSha256: 'a'.repeat(64)
    })
    expect(readMobileConversationBranchIntent(key)?.branchId).toBe(first.branchId)
  })

  it('keeps preparation, start, and uncertain delivery visibly distinct', () => {
    const branch = { error: null, delivery: null } as AgentSessionBranchRecord
    expect(mobileConversationBranchStateLabel({ ...branch, state: 'prepared' })).toContain(
      'has not started'
    )
    expect(mobileConversationBranchStateLabel({ ...branch, state: 'started' })).toContain('Started')
    expect(mobileConversationBranchStateLabel({ ...branch, state: 'fork-unverified' })).toContain(
      'Preparation is unconfirmed'
    )
    expect(
      mobileConversationBranchStateLabel({ ...branch, state: 'delivery-unverified' })
    ).toContain('Delivery is unconfirmed')
  })
})
