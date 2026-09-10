import { expect, it, vi } from 'vitest'
import { createRuntimeRemoteManagedWorktree } from './runtime-remote-managed-worktree-create'

const request = vi.hoisted(() => vi.fn())
vi.mock('./runtime-remote-worktree-create-request', () => ({
  requestRuntimeRemoteWorktree: request
}))

it.each([true, false])(
  'pauses all outer runtime startup after a recovered SSH checkout (activate=%s)',
  async (activate) => {
    const checkoutWarning = {
      kind: 'post-checkout-hook-failed' as const,
      message: 'missing setup script',
      path: '/repo/feature'
    }
    request.mockResolvedValue({
      worktree: { id: '/repo/feature', path: '/repo/feature', displayName: 'My label' },
      checkoutWarning,
      setup: { runnerScriptPath: '/repo/setup.sh' },
      defaultTabs: { tabs: [{ command: 'danger' }], runCommands: true }
    })
    const deps = {
      store: {},
      canSpawn: () => true,
      markTrusted: vi.fn(),
      createTerminal: vi.fn(),
      pasteDraft: vi.fn(),
      sendFollowup: vi.fn(),
      provision: vi.fn(),
      activate: vi.fn(),
      invalidateResolvedWorktrees: vi.fn(),
      invalidateWorktreeScan: vi.fn(),
      notifyWorktreesChanged: vi.fn()
    }
    const result = await createRuntimeRemoteManagedWorktree(
      { id: 'repo', connectionId: 'ssh-1' } as never,
      {
        name: 'feature',
        activate,
        startup: { command: 'agent' },
        awaitTerminalProvisioning: true
      } as never,
      deps as never
    )
    expect(result.checkoutWarning).toEqual(checkoutWarning)
    expect(result.worktree.displayName).toBe('My label')
    expect(result.setup).toBeUndefined()
    expect(result.defaultTabs).toBeUndefined()
    expect(result.startupTerminal).toBeUndefined()
    expect(result.setupReceipt?.state).toBe('skipped')
    expect(deps.createTerminal).not.toHaveBeenCalled()
    expect(deps.provision).not.toHaveBeenCalled()
    expect(deps.markTrusted).not.toHaveBeenCalled()
    expect(deps.activate).not.toHaveBeenCalled()
    expect(deps.notifyWorktreesChanged).toHaveBeenCalledWith('repo')
  }
)
