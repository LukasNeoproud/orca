import { posix, win32 } from 'node:path'
import { parseWorktreeList } from '../git-worktree-porcelain-parser'
import { readGitCommandFailureText } from '../git-command-failure-text'
import type { WorktreeCheckoutWarning } from './checkout-warning'

type GitProbe = (
  args: string[],
  cwd: string,
  options?: { timeout: number }
) => Promise<{ stdout: string }>

function boundedProbe(git: GitProbe): GitProbe {
  const deadline = Date.now() + 30_000
  return (args, cwd) => {
    const timeout = deadline - Date.now()
    if (timeout <= 0) {
      throw new Error('Checkout verification timed out')
    }
    return git(args, cwd, { timeout })
  }
}
type RecoverySnapshot = { commonDir: string; expectedOid: string }

function canonicalPath(value: string, cwd: string): string {
  const windows = /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')
  const resolved = (windows ? win32 : posix).resolve(cwd, value)
  return windows ? resolved.toLowerCase() : resolved
}

async function commonDir(git: GitProbe, cwd: string): Promise<string> {
  const { stdout } = await git(['rev-parse', '--git-common-dir'], cwd)
  return canonicalPath(stdout.trimEnd(), cwd)
}

async function registration(git: GitProbe, repo: string, target: string) {
  // The line porcelain parser decodes quoted paths and works on Git 2.25.
  const { stdout } = await git(['worktree', 'list', '--porcelain'], repo)
  return parseWorktreeList(stdout).find(
    (entry) => canonicalPath(entry.path, repo) === canonicalPath(target, repo)
  )
}

export async function prepareCompletedCheckoutRecovery(
  git: GitProbe,
  repo: string,
  target: string,
  expectedRef: string
): Promise<RecoverySnapshot | undefined> {
  git = boundedProbe(git)
  try {
    if (await registration(git, repo, target)) {
      return undefined
    }
    const expectedOid = (
      await git(['rev-parse', '--verify', `${expectedRef}^{commit}`], repo)
    ).stdout.trim()
    if (!/^[0-9a-f]{40,64}$/.test(expectedOid)) {
      return undefined
    }
    return { expectedOid, commonDir: await commonDir(git, repo) }
  } catch {
    return undefined
  }
}

export async function recoverCompletedCheckout(
  git: GitProbe,
  snapshot: RecoverySnapshot | undefined,
  repo: string,
  target: string,
  branch: string,
  error: unknown
): Promise<WorktreeCheckoutWarning | undefined> {
  git = boundedProbe(git)
  const failure = error as { code?: unknown; signal?: unknown; killed?: unknown; name?: unknown }
  if (
    !snapshot ||
    !failure ||
    typeof failure.code !== 'number' ||
    !Number.isInteger(failure.code) ||
    failure.code <= 0 ||
    failure.signal ||
    failure.killed ||
    failure.name === 'AbortError'
  ) {
    return undefined
  }
  try {
    const registered = await registration(git, repo, target)
    const ref = `refs/heads/${branch.replace(/^refs\/heads\//, '')}`
    if (!registered || registered.branch !== ref || registered.head !== snapshot.expectedOid) {
      return undefined
    }
    if ((await commonDir(git, target)) !== snapshot.commonDir) {
      return undefined
    }
    const topLevel = (await git(['rev-parse', '--show-toplevel'], target)).stdout.trimEnd()
    if (canonicalPath(topLevel, target) !== canonicalPath(target, repo)) {
      return undefined
    }
    if ((await git(['symbolic-ref', '--quiet', 'HEAD'], target)).stdout.trim() !== ref) {
      return undefined
    }
    if (
      (await git(['rev-parse', '--verify', 'HEAD'], target)).stdout.trim() !== snapshot.expectedOid
    ) {
      return undefined
    }
    // Assume-unchanged/skip-worktree flags can conceal incomplete tracked contents.
    const flags = (await git(['ls-files', '-v', '-z'], target)).stdout.split('\0')
    if (flags.some((entry) => entry && (entry[0] === 'S' || /[a-z]/.test(entry[0])))) {
      return undefined
    }
    await git(
      ['diff-index', '--cached', '--quiet', '--ignore-submodules=none', snapshot.expectedOid, '--'],
      target
    )
    await git(
      ['-c', 'core.fsmonitor=false', 'diff-files', '--quiet', '--ignore-submodules=none', '--'],
      target
    )
    const message = readGitCommandFailureText(error).slice(0, 8192)
    return {
      kind: /post-checkout/i.test(message)
        ? 'post-checkout-hook-failed'
        : 'git-error-after-checkout',
      message,
      path: target
    }
  } catch {
    return undefined
  }
}
