import type {
  GitBranchEntry,
  GitBranchListResult,
  GitDeleteBranchRequest,
  GitDeleteBranchResult
} from '../../shared/git-branch-list'
import { isProtectedBranchName } from '../../shared/git-merged-branch-cleanup'
import { deleteRemoteBranchAt, gitErrorMessage, recordDeletedBranch } from './merged-branch-cleanup'
import { gitExecFileAsync } from './runner'
import { forceDeleteLocalBranch } from './worktree-branch-removal'
import { gitExecOptions, type GitWorktreeExecOptions } from './worktree-operation-options'

const REF_FIELDS = [
  '%(refname)',
  '%(objectname)',
  '%(HEAD)',
  '%(upstream)',
  '%(upstream:track)',
  '%(worktreepath)',
  '%(committerdate:unix)',
  '%(contents:subject)'
].join('%00')

type Git = (args: string[]) => Promise<{ stdout: string }>

function gitFor(repoPath: string, options: GitWorktreeExecOptions): Git {
  return (args) => gitExecFileAsync(args, gitExecOptions(repoPath, options))
}

function trackedCount(track: string, word: 'ahead' | 'behind'): number {
  return Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)
}

/** Splits `origin/feature/x` at the longest configured remote name, which may itself hold a slash. */
function splitRemoteBranch(
  name: string,
  remotes: readonly string[]
): { remote: string; branch: string } | null {
  const remote = remotes
    .filter((candidate) => name.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0]
  return remote ? { remote, branch: name.slice(remote.length + 1) } : null
}

async function readRemotes(git: Git): Promise<string[]> {
  return (await git(['remote'])).stdout.split('\n').filter(Boolean)
}

/** Every local and remote branch with what a branch list shows about it. */
export async function listBranches(
  repoPath: string,
  options: GitWorktreeExecOptions = {}
): Promise<GitBranchListResult> {
  const git = gitFor(repoPath, options)
  const [{ stdout }, remotes] = await Promise.all([
    git(['for-each-ref', `--format=${REF_FIELDS}`, 'refs/heads', 'refs/remotes']),
    readRemotes(git)
  ])
  const branches: GitBranchEntry[] = []
  for (const line of stdout.split('\n')) {
    const [
      refname = '',
      head = '',
      mark = '',
      upstream = '',
      track = '',
      worktree = '',
      date = ''
    ] = line.split('\0')
    // A subject may hold anything but a newline, so it is whatever follows the seventh field.
    const subject = line.split('\0').slice(7).join('\0')
    if (refname.startsWith('refs/heads/')) {
      const name = refname.slice('refs/heads/'.length)
      branches.push({
        kind: 'local',
        name,
        head,
        subject,
        ...(date ? { timestamp: Number(date) * 1000 } : {}),
        current: mark === '*',
        protected: isProtectedBranchName(name),
        ...(worktree ? { worktreePath: worktree } : {}),
        ...(upstream
          ? {
              upstream: {
                name: upstream.replace(/^refs\/(remotes|heads)\//, ''),
                ahead: trackedCount(track, 'ahead'),
                behind: trackedCount(track, 'behind'),
                gone: track.includes('gone')
              }
            }
          : {})
      })
    } else if (refname.startsWith('refs/remotes/')) {
      const name = refname.slice('refs/remotes/'.length)
      const parts = splitRemoteBranch(name, remotes)
      // `origin/HEAD` is a pointer to the default branch, not a branch.
      if (parts && parts.branch !== 'HEAD') {
        branches.push({
          kind: 'remote',
          name,
          head,
          subject,
          ...(date ? { timestamp: Number(date) * 1000 } : {}),
          current: false,
          protected: isProtectedBranchName(parts.branch)
        })
      }
    }
  }
  return { branches }
}

/**
 * Deletes one branch the caller chose, merged or not; the caller is the one who confirms an
 * unmerged deletion. Long-lived and checked-out branches are refused.
 */
export async function deleteBranch(
  repoPath: string,
  request: GitDeleteBranchRequest,
  options: GitWorktreeExecOptions = {}
): Promise<GitDeleteBranchResult> {
  const git = gitFor(repoPath, options)
  const { branches } = await listBranches(repoPath, options)
  const branch = branches.find(
    (entry) => entry.kind === request.kind && entry.name === request.name
  )
  if (!branch || branch.head !== request.head) {
    throw new Error(`Branch "${request.name}" changed. Refresh the list and try again.`)
  }
  if (branch.protected) {
    throw new Error(`"${request.name}" is a long-lived branch and is not deleted from here.`)
  }
  const remotes = await readRemotes(git)
  if (branch.kind === 'remote') {
    const parts = splitRemoteBranch(branch.name, remotes)
    if (!parts) {
      throw new Error(`"${request.name}" does not belong to a configured remote.`)
    }
    await deleteRemoteBranchAt(repoPath, parts.remote, parts.branch, branch.head, options)
    return { remoteDeleted: true }
  }
  if (branch.worktreePath) {
    throw new Error(`Branch "${branch.name}" is checked out in ${branch.worktreePath}.`)
  }
  const result: GitDeleteBranchResult = { remoteDeleted: false }
  const tracked = branch.upstream ? splitRemoteBranch(branch.upstream.name, remotes) : null
  const remoteHead = branches.find(
    (entry) => entry.kind === 'remote' && entry.name === branch.upstream?.name
  )?.head
  // Remote first, while the local branch still records what it tracks.
  if (request.deleteRemote && tracked && remoteHead === branch.head) {
    try {
      await deleteRemoteBranchAt(repoPath, tracked.remote, tracked.branch, branch.head, options)
      result.remoteDeleted = true
    } catch (error) {
      result.remoteError = gitErrorMessage(error)
    }
  }
  await forceDeleteLocalBranch(
    repoPath,
    branch.name,
    branch.head,
    (args, cwd) => gitExecFileAsync(args, gitExecOptions(cwd, options)),
    options
  )
  await recordDeletedBranch(repoPath, git, branch)
  return result
}

/** Renames a local branch no worktree has checked out; its upstream setting moves with it. */
export async function renameBranch(
  repoPath: string,
  name: string,
  newName: string,
  options: GitWorktreeExecOptions = {}
): Promise<void> {
  const git = gitFor(repoPath, options)
  const { branches } = await listBranches(repoPath, options)
  const branch = branches.find((entry) => entry.kind === 'local' && entry.name === name)
  if (!branch) {
    throw new Error(`Branch "${name}" no longer exists.`)
  }
  if (branch.protected) {
    throw new Error(`"${name}" is a long-lived branch and is not renamed from here.`)
  }
  if (branch.worktreePath) {
    throw new Error(`Branch "${name}" is checked out in ${branch.worktreePath}; rename it there.`)
  }
  try {
    await git(['check-ref-format', '--branch', newName])
  } catch {
    throw new Error(`"${newName}" is not a valid branch name.`)
  }
  // Without -M: an existing branch of that name is never overwritten.
  await git(['branch', '-m', '--', name, newName])
}
