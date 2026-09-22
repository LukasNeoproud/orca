import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalSnapshot } from '../../../shared/agent-session-journal-types'
import { forkStructuredAgentSessionConversation } from './structured-agent-session-fork'

function snapshot(running: boolean): AgentJournalSnapshot {
  return {
    sessionId: 'source-1',
    cursor: { epoch: 'epoch-1', sequence: running ? 2 : 1 },
    items: [
      {
        itemId: 'codex:thread:turn:0',
        revision: 1,
        sequence: 1,
        observedAt: 1,
        body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'done' }] }
      },
      ...(running
        ? [
            {
              itemId: 'status-1',
              revision: 1,
              sequence: 2,
              observedAt: 2,
              body: {
                kind: 'status' as const,
                text: 'working',
                turnLifecycle: { turnId: 'turn-2', state: 'running' as const }
              }
            }
          ]
        : [])
    ],
    submissions: []
  }
}

const request = {
  sourceSessionId: 'source-1',
  targetSessionId: 'target-1',
  targetLocation: {
    executionHostId: 'local',
    wslDistro: null,
    workspaceId: 'workspace-1',
    workspaceKind: 'folder'
  },
  boundaryItemId: 'codex:thread:turn:0',
  expectedEpoch: 'epoch-1'
} as const

describe('forkStructuredAgentSessionConversation', () => {
  it('rechecks the running-turn fence inside the source session queue', async () => {
    const forkConversation = vi.fn()
    await expect(
      forkStructuredAgentSessionConversation({
        request,
        adapter: { forkConversation } as never,
        serialize: async (_sessionId, task) => task(),
        snapshot: () => snapshot(true)
      })
    ).rejects.toThrow('agent_session_branch_source_busy')
    expect(forkConversation).not.toHaveBeenCalled()
  })

  it('forks only after the pinned source epoch and item are revalidated', async () => {
    const forkConversation = vi.fn(async () => ({ providerSessionId: 'provider-child' }))
    await expect(
      forkStructuredAgentSessionConversation({
        request,
        adapter: { forkConversation } as never,
        serialize: async (_sessionId, task) => task(),
        snapshot: () => snapshot(false)
      })
    ).resolves.toEqual({ providerSessionId: 'provider-child' })
    expect(forkConversation).toHaveBeenCalledWith(request)
  })
})
