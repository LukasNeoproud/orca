import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { startMobilePortableBranch } from './mobile-portable-conversation-rpc'

const branch = {
  branchId: 'branch-1',
  target: {
    agent: 'codex',
    terminal: {
      workspace: { workspaceId: 'workspace-1' },
      launch: null
    }
  },
  handoff: { content: 'exact handoff' }
} as never

function success(result: unknown) {
  return { id: 'rpc', ok: true as const, result, _meta: { runtimeId: 'runtime' } }
}

describe('startMobilePortableBranch', () => {
  it('persists the launch receipt before sending and leaves mobile delivery unverified', async () => {
    const calls: string[] = []
    const sendRequest = vi.fn(async (method: string) => {
      calls.push(method)
      if (method === 'portableConversation.branchBeginStart') {
        return success({ branch, authorized: true })
      }
      if (method === 'session.tabs.createTerminal') {
        return success({
          tab: {
            type: 'terminal',
            status: 'ready',
            terminal: 'terminal-1',
            id: 'tab-1',
            parentTabId: 'tab-1',
            leafId: '00000000-0000-4000-8000-000000000001',
            ptyId: 'pty-1'
          }
        })
      }
      if (method === 'portableConversation.branchCompleteStart') {
        return success({ branch: { ...branch, target: { ...branch.target } } })
      }
      return success({ send: { accepted: true } })
    })

    const result = await startMobilePortableBranch({
      client: { sendRequest } as Pick<RpcClient, 'sendRequest'>,
      branchId: 'branch-1',
      attemptId: 'attempt-1'
    })

    expect(calls).toEqual([
      'portableConversation.branchBeginStart',
      'session.tabs.createTerminal',
      'portableConversation.branchCompleteStart',
      'terminal.send'
    ])
    expect(result.outcome).toBe('unknown')
    expect(result.hasReceipt).toBe(true)
    expect(sendRequest).toHaveBeenNthCalledWith(
      3,
      'portableConversation.branchCompleteStart',
      expect.objectContaining({ outcome: expect.objectContaining({ kind: 'launched' }) }),
      expect.anything()
    )
  })

  it('does not create or send when the durable attempt is already claimed', async () => {
    const saved = {
      ...branch,
      target: {
        ...branch.target,
        terminal: { ...branch.target.terminal, launch: { status: 'unknown' } }
      }
    }
    const sendRequest = vi.fn().mockResolvedValue(success({ branch: saved, authorized: false }))

    const result = await startMobilePortableBranch({
      client: { sendRequest } as Pick<RpcClient, 'sendRequest'>,
      branchId: 'branch-1',
      attemptId: 'attempt-1'
    })

    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(result.outcome).toBe('unknown')
    expect(result.hasReceipt).toBe(false)
  })
})
