import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionBranchNotice } from '../../../shared/agent-session-branch-proposal'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import { sendAgentSessionBranchNotice } from './structured-agent-session-branch-notice'

function host(notice: AgentSessionBranchNotice) {
  const hold = vi.fn()
  return {
    hold,
    release: vi.fn(),
    send: vi.fn(),
    deps: {
      branchStore: {
        getNotice: () => notice,
        runExclusive: async (_key: string, run: () => Promise<unknown>) => run(),
        putNotice: vi.fn()
      }
    }
  } as unknown as StructuredAgentSessionHost & { hold: typeof hold }
}

function notice(status: 'pending' | 'unknown' | 'accepted'): AgentSessionBranchNotice {
  return {
    schemaVersion: 1,
    noticeId: 'notice-1',
    sourceSessionId: 'source-1',
    branchIds: ['branch-1'],
    content: 'The child owns the parser scope.',
    contentSha256: 'a'.repeat(64),
    delivery: {
      clientMessageId: '1800000000000-11111111111111111111111111111111',
      status,
      reason: null,
      submittedAt: 1,
      resolvedAt: status === 'accepted' ? 2 : null
    },
    createdAt: 1,
    updatedAt: 2
  }
}

describe('sendAgentSessionBranchNotice', () => {
  it.each(['pending', 'unknown'] as const)(
    'rejects a different operation while the persisted delivery is %s',
    async (status) => {
      const currentHost = host(notice(status))
      await expect(
        sendAgentSessionBranchNotice({
          host: currentHost,
          caller: { callerKey: 'test' },
          params: {
            noticeId: 'notice-1',
            envelope: {
              sessionId: 'source-1',
              clientOperationId: '1800000000001-22222222222222222222222222222222',
              expectedRuntimeFence: null,
              payloadFingerprint: 'b'.repeat(64)
            }
          }
        })
      ).rejects.toThrow('agent_session_branch_delivery_in_flight')
      expect(currentHost.hold).not.toHaveBeenCalled()
    }
  )

  it('returns an accepted same-operation replay without waking the provider', async () => {
    const persisted = notice('accepted')
    const currentHost = host(persisted)
    await expect(
      sendAgentSessionBranchNotice({
        host: currentHost,
        caller: { callerKey: 'test' },
        params: {
          noticeId: 'notice-1',
          envelope: {
            sessionId: 'source-1',
            clientOperationId: persisted.delivery!.clientMessageId,
            expectedRuntimeFence: null,
            payloadFingerprint: 'b'.repeat(64)
          }
        }
      })
    ).resolves.toBe(persisted)
    expect(currentHost.hold).not.toHaveBeenCalled()
  })
})
