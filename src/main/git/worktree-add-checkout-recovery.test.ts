import { beforeEach, describe, expect, it, vi } from 'vitest'
const { exec, invalidate } = vi.hoisted(() => ({ exec: vi.fn(), invalidate: vi.fn() }))
vi.mock('./runner', () => ({ gitExecFileAsync: exec }))
vi.mock('./status', () => ({ runWithGitReadCacheInvalidation: (run: () => unknown) => run() }))
vi.mock('./local-repo-ref-maintenance', () => ({
  withRepoRefMaintenancePaused: (_: string, run: () => unknown) => run()
}))
vi.mock('./worktree-scan-cache', () => ({ bumpWorktreeScanGeneration: vi.fn() }))
vi.mock('./wsl-linked-worktree-git-routing', () => ({
  invalidateWslLinkedWorktreeGitRouting: invalidate
}))
import { addWorktree } from './worktree-add'

const oid = 'a'.repeat(40)
beforeEach(() => {
  exec.mockReset()
  invalidate.mockClear()
})
describe('native and WSL checkout recovery routing', () => {
  it.each([false, true])(
    'routes all verification to owning execution context wsl=%s',
    async (wsl) => {
      const repo = wsl ? '\\\\wsl.localhost\\Ubuntu\\home\\repo' : '/repo'
      const target = wsl
        ? '\\\\wsl.localhost\\Ubuntu\\home\\repo\\.worktrees\\topic'
        : '/repo/.worktrees/topic'
      const hostRepo = wsl ? '/home/repo' : repo
      const hostTarget = `${hostRepo}/.worktrees/topic`
      let added = false
      exec.mockImplementation(async (args: string[]) => {
        if (args[0] === 'worktree' && args[1] === 'add') {
          added = true
          throw Object.assign(new Error('post-checkout hook failed'), { code: 1 })
        }
        if (args[0] === 'worktree') {
          return {
            stdout: `worktree ${hostRepo}\nHEAD ${oid}\nbranch refs/heads/main\n\n${added ? `worktree ${hostTarget}\nHEAD ${oid}\nbranch refs/heads/topic\n` : ''}`
          }
        }
        if (args.includes('--git-common-dir')) {
          return { stdout: `${hostRepo}/.git\n` }
        }
        if (args.includes('--show-toplevel')) {
          return { stdout: `${hostTarget}\n` }
        }
        if (args[0] === 'symbolic-ref') {
          return { stdout: 'refs/heads/topic\n' }
        }
        if (args[0] === 'rev-parse') {
          return { stdout: `${oid}\n` }
        }
        return { stdout: '' }
      })
      const result = await addWorktree(repo, target, 'topic', undefined, false, false, {
        checkoutExistingBranch: true,
        recoverCompletedCheckoutFailure: true,
        ...(wsl ? { wslDistro: 'Ubuntu' } : {})
      })
      expect(result.checkoutWarning).toMatchObject({
        kind: 'post-checkout-hook-failed',
        path: target
      })
      expect(invalidate).toHaveBeenCalledWith(target)
      for (const [, options] of exec.mock.calls) {
        expect([repo, target]).toContain(options.cwd)
        expect(options.wslDistro).toBe(wsl ? 'Ubuntu' : undefined)
        expect(options.timeout).toBeGreaterThan(0)
      }
    }
  )
  it('does not probe or recover no-checkout failures', async () => {
    exec.mockRejectedValue(Object.assign(new Error('failed'), { code: 1 }))
    await expect(
      addWorktree('/repo', '/target', 'topic', undefined, false, true, {
        checkoutExistingBranch: true,
        recoverCompletedCheckoutFailure: true
      })
    ).rejects.toThrow('failed')
    expect(exec).toHaveBeenCalledTimes(1)
  })
})
