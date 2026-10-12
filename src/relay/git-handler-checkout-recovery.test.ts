import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { addWorktreeOp } from './git-handler-worktree-ops'
import {
  prepareCompletedCheckoutRecovery,
  recoverCompletedCheckout
} from '../shared/worktree/completed-checkout-recovery'

let root: string
const git = async (args: string[], cwd: string, options?: { timeout?: number }) => {
  const result = await runProcess({ program: 'git', args, cwd, timeoutMs: options?.timeout })
  if (result.code !== 0) {
    throw Object.assign(new Error(result.stderr), { code: result.code, stderr: result.stderr })
  }
  return result
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-checkout-recovery-')))
  await git(['init'], root)
  await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], root)
  await writeFile(join(root, 'tracked.txt'), 'original\n')
  await git(['add', '.'], root)
  await git(
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'initial'],
    root
  )
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const hook = (body = 'echo "post-checkout: missing setup script" >&2\nexit 1') =>
  writeFile(join(root, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
const params = () => ({
  repoPath: root,
  targetDir: join(root, '.worktrees', 'feature', 'topic'),
  branchName: 'feature/topic',
  base: 'main',
  recoverCompletedCheckoutFailure: true
})

describe('completed checkout recovery with real Git', () => {
  it.each([false, true])(
    'recovers hook failure for existing=%s and preserves untracked hook output',
    async (existing) => {
      if (existing) {
        await git(['branch', 'feature/topic'], root)
      }
      await hook(
        'echo generated > generated.txt\necho "post-checkout: scripts/setup-local-properties.sh: No such file or directory" >&2\nexit 1'
      )
      const request = { ...params(), checkoutExistingBranch: existing }
      const result = await addWorktreeOp(git, request)
      expect(result?.checkoutWarning).toMatchObject({
        kind: 'post-checkout-hook-failed',
        path: request.targetDir
      })
      expect(await readFile(join(request.targetDir, 'tracked.txt'), 'utf8')).toBe('original\n')
      expect(await readFile(join(request.targetDir, 'generated.txt'), 'utf8')).toBe('generated\n')
      expect((await git(['branch', '--show-current'], request.targetDir)).stdout.trim()).toBe(
        'feature/topic'
      )
      if (!existing) {
        expect(
          (await git(['config', '--get', 'branch.feature/topic.base'], root)).stdout.trim()
        ).toBe('refs/heads/main')
      }
    }
  )
  it('retains legacy errors without opt-in', async () => {
    await hook()
    await expect(
      addWorktreeOp(git, { ...params(), recoverCompletedCheckoutFailure: false })
    ).rejects.toThrow('post-checkout')
  })
  it.each([
    'echo changed > tracked.txt',
    'rm tracked.txt',
    'echo changed > tracked.txt\ngit add tracked.txt'
  ])('rejects incomplete or modified tracked state: %s', async (body) => {
    await hook(`${body}\nexit 1`)
    await expect(addWorktreeOp(git, params())).rejects.toThrow()
  })
  it('rejects occupied targets even when they already have the expected branch', async () => {
    await addWorktreeOp(git, params())
    await expect(
      addWorktreeOp(git, { ...params(), checkoutExistingBranch: true })
    ).rejects.toThrow()
  })
  it('rejects missing refs', async () => {
    await expect(
      addWorktreeOp(git, { ...params(), checkoutExistingBranch: true })
    ).rejects.toThrow()
  })
  it.each([
    { code: 1, signal: 'SIGTERM' },
    { code: 1, killed: true },
    { code: 'ETIMEDOUT' },
    { code: 1, name: 'AbortError' }
  ])('never recovers interrupted execution %j', async (failure) => {
    const request = params()
    const snapshot = await prepareCompletedCheckoutRecovery(git, root, request.targetDir, 'main')
    await addWorktreeOp(git, request)
    expect(
      await recoverCompletedCheckout(
        git,
        snapshot,
        root,
        request.targetDir,
        request.branchName,
        failure
      )
    ).toBeUndefined()
  })
  it('rejects a changed HEAD after checkout', async () => {
    const request = params()
    const snapshot = await prepareCompletedCheckoutRecovery(git, root, request.targetDir, 'main')
    await addWorktreeOp(git, request)
    await git(
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'changed'
      ],
      request.targetDir
    )
    expect(
      await recoverCompletedCheckout(git, snapshot, root, request.targetDir, request.branchName, {
        code: 1
      })
    ).toBeUndefined()
  })
})
