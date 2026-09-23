import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { forceDeleteMobilePreservedBranch } from './mobile-preserved-branch-delete'

describe('forceDeleteMobilePreservedBranch', () => {
  it('sends the confirmed branch head with the original worktree identity', async () => {
    const sendRequest = vi.fn().mockResolvedValue({ ok: true, result: { deleted: true } })
    await forceDeleteMobilePreservedBranch({
      client: { sendRequest } as unknown as RpcClient,
      worktreeId: 'repo::worktree',
      branch: { branchName: 'feature/mobile', head: 'abc123' }
    })
    expect(sendRequest).toHaveBeenCalledWith('worktree.forceDeleteBranch', {
      worktree: 'id:repo::worktree',
      branchName: 'feature/mobile',
      expectedHead: 'abc123'
    })
  })

  it('never sends a force delete without an expected head', async () => {
    const sendRequest = vi.fn()
    await expect(
      forceDeleteMobilePreservedBranch({
        client: { sendRequest } as unknown as RpcClient,
        worktreeId: 'w',
        branch: { branchName: 'feature/mobile' }
      })
    ).rejects.toThrow('confirmed head')
    expect(sendRequest).not.toHaveBeenCalled()
  })
})
