import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { persistNewWorkspaceSetupPolicy } from './new-workspace-setup-policy'

describe('persistNewWorkspaceSetupPolicy', () => {
  it('preserves existing hook settings and verifies the host saved the policy', async () => {
    const hookSettings = {
      mode: 'override',
      setupRunPolicy: 'ask',
      commandSourcePolicy: 'local-only',
      futurePolicy: 'preserve-me',
      setupAgentStartupPolicy: 'start-immediately',
      scripts: { setup: 'pnpm install', archive: 'echo done' }
    }
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: { repos: [{ id: 'repo-1', hookSettings }] } })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          repo: { hookSettings: { ...hookSettings, setupAgentStartupPolicy: 'wait-for-setup' } }
        }
      })
    await persistNewWorkspaceSetupPolicy({
      client: { sendRequest } as unknown as RpcClient,
      repoId: 'repo-1',
      policy: 'wait-for-setup'
    })
    expect(sendRequest).toHaveBeenNthCalledWith(2, 'repo.update', {
      repo: 'id:repo-1',
      updates: { hookSettings: { ...hookSettings, setupAgentStartupPolicy: 'wait-for-setup' } }
    })
  })

  it('does not create a policy write when the latest repo already matches', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        repos: [{ id: 'repo-1', hookSettings: { setupAgentStartupPolicy: 'wait-for-setup' } }]
      }
    })
    await persistNewWorkspaceSetupPolicy({
      client: { sendRequest } as unknown as RpcClient,
      repoId: 'repo-1',
      policy: 'wait-for-setup'
    })
    expect(sendRequest).toHaveBeenCalledTimes(1)
  })

  it('blocks create when an older host drops the new policy', async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: { repos: [{ id: 'repo-1' }] } })
      .mockResolvedValueOnce({ ok: true, result: { repo: { hookSettings: {} } } })
    await expect(
      persistNewWorkspaceSetupPolicy({
        client: { sendRequest } as unknown as RpcClient,
        repoId: 'repo-1',
        policy: 'wait-for-setup'
      })
    ).rejects.toThrow('did not save')
  })
})
