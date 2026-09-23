import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionBranchRecord } from '../../../src/shared/agent-session-branch'
import type { RpcClient } from '../transport/rpc-client'
import {
  MobileConversationBranchUnsupportedError,
  previewMobileConversationBranch,
  startMobileConversationBranch
} from './mobile-conversation-branch-rpc'

const prepared = {
  branchId: 'branch-1',
  state: 'prepared',
  target: { sessionId: 'codex_child' },
  handoff: { content: 'Review the selected answer.' }
} as AgentSessionBranchRecord

describe('mobile conversation branch RPC', () => {
  it('treats an old host as unsupported without preparing a branch', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method' }
    })
    await expect(
      previewMobileConversationBranch({ sendRequest } as unknown as RpcClient, {
        sourceSessionId: 'codex_source',
        expectedEpoch: 'epoch-1',
        sourceItemId: 'item-1'
      })
    ).rejects.toBeInstanceOf(MobileConversationBranchUnsupportedError)
    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.branchPreview',
      {
        sourceSessionId: 'codex_source',
        expectedEpoch: 'epoch-1',
        sourceItemId: 'item-1'
      },
      expect.objectContaining({ timeoutMs: 30_000 })
    )
  })

  it('sends one branchStart with the exact saved handoff and a checkpoint', async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: { ok: true, page: { fence: 7 } } })
      .mockResolvedValueOnce({ ok: true, result: { branch: { ...prepared, state: 'started' } } })
    const result = await startMobileConversationBranch({
      client: { sendRequest } as unknown as RpcClient,
      branch: prepared,
      operationId: 'op-1'
    })
    expect(result.state).toBe('started')
    expect(sendRequest).toHaveBeenCalledTimes(2)
    expect(sendRequest.mock.calls[1]).toMatchObject([
      'agentSession.branchStart',
      {
        branchId: 'branch-1',
        envelope: {
          sessionId: 'codex_child',
          clientOperationId: 'op-1',
          expectedRuntimeFence: 7,
          payloadFingerprint: expect.any(String)
        }
      },
      expect.objectContaining({ failWhenDisconnected: true })
    ])
  })

  it('does not send or replay an unverified branch delivery', async () => {
    const sendRequest = vi.fn()
    await expect(
      startMobileConversationBranch({
        client: { sendRequest } as unknown as RpcClient,
        branch: { ...prepared, state: 'delivery-unverified' },
        operationId: 'op-1'
      })
    ).rejects.toThrow('unverified')
    expect(sendRequest).not.toHaveBeenCalled()
  })
})
