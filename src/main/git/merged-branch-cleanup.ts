import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  branchHasNoUnmergedChangesOnAnyTarget,
  type GitBranchCleanupExec
} from '../../shared/git-branch-cleanup'
import {
  GIT_DELETED_BRANCH_LOG_NAME,
  isProtectedBranchName,
  type GitDeleteMergedBranchRequest,
  type GitDeleteMergedBranchesResult,
  type GitMergedBranch,
  type GitMergedBranchesResult
} from '../../shared/git-merged-branch-cleanup'
import { listAzureDevOpsCompletedPullRequestHeads } from '../azure-devops/completed-pull-request-heads'
import { withLocalGitCapabilityCacheForExecution } from './git-capability-state'
import { gitExecFileAsync } from './runner'
import { forceDeleteLocalBranch } from './worktree-branch-removal'
import { gitExecOptions, type GitWorktreeExecOptions } from './worktree-operation-options'

const REMOTE = 'origin'
const REMOTE_PREFIX = `refs/remotes/${REMOTE}/`
const REMOTE_TIMEOUT_MS = 60_000
const PROOF_CONCURRENCY = 4
const REF_FIELDS = [
  '%(refname)',
  '%(objectname)',
  '%(upstream)',
  '%(upstream:remotename)',
  '%(upstream:remoteref)',
  '%(worktreepath)'
].join('%00')

type RefRow = {
  refname: string
  oid: string
  upstream: string
  upstreamRemote: string
  upstreamRemoteRef: string
  worktreePath: string
}

export type ListMergedBranchesOptions = GitWorktreeExecOptions & {
  /** A full remote ref to check against instead of the remote's default branch. */
  target?: string
}

function execFor(repoPath: string, options: GitWorktreeExecOptions): GitBranchCleanupExec {
  return (args, execOptions) =>
    gitExecFileAsync(args, {
      ...gitExecOptions(repoPath, options),
      ...(execOptions?.stdin !== undefined ? { stdin: execOptions.stdin } : {})
    })
}

async function optionalStdout(runGit: GitBranchCleanupExec, args: string[]): Promise<string> {
  try {
    return (await runGit(args)).stdout.trim()
  } catch {
    return ''
  }
}

/** Prunes too, so a branch its pull request deleted is not mistaken for one still on the remote. */
async function fetchRemote(repoPath: string, options: GitWorktreeExecOptions): Promise<boolean> {
  try {
    await gitExecFileAsync(['fetch', '--prune', REMOTE], {
      ...gitExecOptions(repoPath, options),
      timeout: REMOTE_TIMEOUT_MS
    })
    return true
  } catch {
    return false
  }
}

async function readRefs(runGit: GitBranchCleanupExec): Promise<RefRow[]> {
  const { stdout } = await runGit([
    'for-each-ref',
    `--format=${REF_FIELDS}`,
    'refs/heads',
    'refs/remotes'
  ])
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [refname = '', oid = '', upstream = '', remote = '', remoteRef = '', worktree = ''] =
        line.split('\0')
      return {
        refname,
        oid,
        upstream,
        upstreamRemote: remote,
        upstreamRemoteRef: remoteRef,
        worktreePath: worktree
      }
    })
}

/** The remote's default branch first, then its other long-lived branches. */
async function resolveTargets(runGit: GitBranchCleanupExec, rows: RefRow[]): Promise<string[]> {
  const remoteRefs = new Set(
    rows.map((row) => row.refname).filter((ref) => ref !== `${REMOTE_PREFIX}HEAD`)
  )
  const head = await optionalStdout(runGit, ['symbolic-ref', '--quiet', `${REMOTE_PREFIX}HEAD`])
  const targets = [head, `${REMOTE_PREFIX}main`, `${REMOTE_PREFIX}master`].filter((ref) =>
    remoteRefs.has(ref)
  )
  for (const ref of remoteRefs) {
    if (ref.startsWith(REMOTE_PREFIX) && isProtectedBranchName(ref.slice(REMOTE_PREFIX.length))) {
      targets.push(ref)
    }
  }
  return [...new Set(targets)]
}

function toMergedBranch(row: RefRow, oidByRef: Map<string, string>): GitMergedBranch {
  const name = row.refname.slice('refs/heads/'.length)
  const upstreamOid = row.upstream ? oidByRef.get(row.upstream) : undefined
  const remoteBranch = row.upstreamRemoteRef.startsWith('refs/heads/')
    ? row.upstreamRemoteRef.slice('refs/heads/'.length)
    : ''
  const neverPushed = !row.upstream && !oidByRef.has(`${REMOTE_PREFIX}${name}`)
  return {
    name,
    head: row.oid,
    category: row.worktreePath ? 'in-workspace' : neverPushed ? 'never-pushed' : 'merged',
    upstreamGone: Boolean(row.upstream) && upstreamOid === undefined,
    ...(row.worktreePath ? { worktreePath: row.worktreePath } : {}),
    ...(upstreamOid !== undefined && row.upstreamRemote && remoteBranch
      ? {
          remote: {
            remote: row.upstreamRemote,
            branch: remoteBranch,
            inSync: upstreamOid === row.oid
          }
        }
      : {})
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Local branches with every change already in a long-lived branch on the remote, whether it got
 * there by merge, rebase or squash. Long-lived branches themselves are never listed.
 */
export async function listMergedBranches(
  repoPath: string,
  options: ListMergedBranchesOptions = {}
): Promise<GitMergedBranchesResult> {
  const runGit = execFor(repoPath, options)
  const remoteFresh = await fetchRemote(repoPath, options)
  const rows = await readRefs(runGit)
  const targets = await resolveTargets(runGit, rows)
  if (options.target && !targets.includes(options.target)) {
    throw new Error(`"${options.target}" is not a branch the cleanup can compare with.`)
  }
  const targetRef = options.target ?? targets[0] ?? null
  if (!targetRef) {
    return { targetRef: null, targets, remoteFresh, branches: [] }
  }
  const targetBranch = targetRef.slice(REMOTE_PREFIX.length)
  const oidByRef = new Map(rows.map((row) => [row.refname, row.oid]))
  const candidates = rows
    .filter((row) => row.refname.startsWith('refs/heads/'))
    .map((row) => toMergedBranch(row, oidByRef))
    .filter((branch) => branch.name !== targetBranch && !isProtectedBranchName(branch.name))

  // Ancestors of the target need no further proof; one call finds them all.
  const ancestors = new Set(
    (
      await optionalStdout(runGit, [
        'for-each-ref',
        '--format=%(refname)',
        `--merged=${targetRef}`,
        'refs/heads'
      ])
    ).split('\n')
  )
  // Why: a squash merge whose files changed again afterwards leaves Git nothing to match, but
  // the completed pull request still names the exact commit that went in.
  const completed = await listAzureDevOpsCompletedPullRequestHeads(repoPath, targetBranch, {
    wslDistro: options.wslDistro
  })
  const merged = await withLocalGitCapabilityCacheForExecution(
    { cwd: repoPath, wslDistro: options.wslDistro, signal: options.signal },
    (capabilities) =>
      mapWithConcurrency(candidates, PROOF_CONCURRENCY, async (branch) => {
        options.signal?.throwIfAborted()
        return (
          ancestors.has(`refs/heads/${branch.name}`) ||
          completed?.get(branch.remote?.branch ?? branch.name)?.has(branch.head) === true ||
          branchHasNoUnmergedChangesOnAnyTarget(runGit, branch.name, [targetRef], capabilities)
        )
      })
  )
  return {
    targetRef,
    targets,
    remoteFresh,
    branches: candidates.filter((_, index) => merged[index])
  }
}

export function gitErrorMessage(error: unknown): string {
  const stderr =
    typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : ''
  return stderr.trim() || (error instanceof Error ? error.message : String(error))
}

/** Best effort: a branch deleted by mistake can be recreated from the commit recorded here. */
export async function recordDeletedBranch(
  repoPath: string,
  runGit: GitBranchCleanupExec,
  branch: { name: string; head: string }
): Promise<void> {
  try {
    const gitDir = await optionalStdout(runGit, ['rev-parse', '--git-common-dir'])
    if (gitDir) {
      await appendFile(
        resolve(repoPath, gitDir, GIT_DELETED_BRANCH_LOG_NAME),
        `${new Date().toISOString()}\t${branch.head}\t${branch.name}\n`
      )
    }
  } catch {
    // The deletion itself already succeeded.
  }
}

/** Deletes a remote branch only if it is still at `oid`, the commit the caller reasoned about. */
export async function deleteRemoteBranchAt(
  repoPath: string,
  remote: string,
  branch: string,
  oid: string,
  options: GitWorktreeExecOptions = {}
): Promise<void> {
  if (remote.startsWith('-')) {
    throw new Error('Invalid remote name')
  }
  const remoteRef = `refs/heads/${branch}`
  await gitExecFileAsync(
    ['push', `--force-with-lease=${remoteRef}:${oid}`, remote, `:${remoteRef}`],
    { ...gitExecOptions(repoPath, options), timeout: REMOTE_TIMEOUT_MS }
  )
}

/** Deletes the requested branches that are still merged and still at the commit the caller saw. */
export async function deleteMergedBranches(
  repoPath: string,
  requests: readonly GitDeleteMergedBranchRequest[],
  options: ListMergedBranchesOptions = {}
): Promise<GitDeleteMergedBranchesResult> {
  const runGit = execFor(repoPath, options)
  const current = new Map(
    (await listMergedBranches(repoPath, options)).branches.map((branch) => [branch.name, branch])
  )
  const result: GitDeleteMergedBranchesResult = { deleted: [], remoteDeleted: [], failures: [] }
  for (const request of requests) {
    const branch = current.get(request.name)
    if (!branch || branch.head !== request.head || branch.category === 'in-workspace') {
      result.failures.push({
        name: request.name,
        scope: 'local',
        error:
          branch?.category === 'in-workspace'
            ? 'The branch is checked out in a workspace.'
            : 'The branch changed or is no longer merged.'
      })
      continue
    }
    // Remote first, while the local branch still records what it tracks.
    if (request.deleteRemote && branch.remote?.inSync) {
      try {
        await deleteRemoteBranchAt(
          repoPath,
          branch.remote.remote,
          branch.remote.branch,
          branch.head,
          options
        )
        result.remoteDeleted.push(branch.name)
      } catch (error) {
        result.failures.push({ name: branch.name, scope: 'remote', error: gitErrorMessage(error) })
      }
    }
    try {
      await forceDeleteLocalBranch(
        repoPath,
        branch.name,
        branch.head,
        (args, cwd) => gitExecFileAsync(args, gitExecOptions(cwd, options)),
        options
      )
      result.deleted.push(branch.name)
      await recordDeletedBranch(repoPath, runGit, branch)
    } catch (error) {
      result.failures.push({ name: branch.name, scope: 'local', error: gitErrorMessage(error) })
    }
  }
  return result
}
