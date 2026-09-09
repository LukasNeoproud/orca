import type { BranchManagementAction } from '../../shared/worktree/branch-management'

export type BranchManagementGit = (args: string[]) => Promise<{ stdout: string }>

export type ManagedWorktreeListing = () => Promise<{ path: string; branch: string }[]>

export async function inspectManagedBranches(
  git: BranchManagementGit,
  listWorktrees: ManagedWorktreeListing
) {
  const [head, branchResult, worktrees, status] = await Promise.all([
    git(['rev-parse', '--verify', 'HEAD']),
    git(['for-each-ref', '--format=%(HEAD)%09%(refname)', 'refs/heads/']),
    listWorktrees(),
    git(['status', '--porcelain', '--untracked-files=normal'])
  ])
  const refs = branchResult.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [marker, name] = line.split('\t')
      return [marker, (name ?? '').replace(/^refs\/heads\//, '')]
    })
  return {
    head: head.stdout.trim(),
    current: refs.find(([marker]) => marker === '*')?.[1] ?? null,
    branches: refs.map(([, name]) => name).filter(Boolean),
    worktrees: worktrees.map((item) => ({
      path: item.path,
      branch: item.branch.replace(/^refs\/heads\//, '') || null
    })),
    dirty: Boolean(status.stdout.trim())
  }
}

export async function mutateManagedBranch(
  git: BranchManagementGit,
  action: BranchManagementAction,
  branch: string,
  currentPath: string,
  assertSafe: () => Promise<void>,
  listWorktrees: ManagedWorktreeListing
): Promise<void> {
  if (!branch || branch.startsWith('-') || branch === 'HEAD') {
    throw new Error('Invalid branch name.')
  }
  await git(['check-ref-format', `refs/heads/${branch}`])
  const state = await inspectManagedBranches(git, listWorktrees)
  const occupied = state.worktrees.find(
    (item) => item.branch === branch && item.path !== currentPath && state.current !== branch
  )
  if (occupied) {
    throw new Error(`Branch is checked out at ${occupied.path}. Open that worktree instead.`)
  }
  if (action === 'switch' && !state.branches.includes(branch)) {
    throw new Error('Branch no longer exists. Refresh the branch list.')
  }
  if (action !== 'switch' && state.branches.includes(branch)) {
    throw new Error('A local branch with that name already exists.')
  }
  if (action === 'rename' && !state.current) {
    throw new Error('Detached HEAD has no branch to rename. Create a branch from current HEAD.')
  }
  await assertSafe()
  const dirty =
    action !== 'rename' &&
    Boolean((await git(['status', '--porcelain', '--untracked-files=normal'])).stdout.trim())
  if (dirty) {
    throw new Error(
      'Commit or remove staged, unstaged, and untracked changes before changing branches.'
    )
  }
  await git(
    action === 'switch'
      ? ['checkout', branch, '--']
      : action === 'create'
        ? ['checkout', '-b', branch, 'HEAD', '--']
        : ['branch', '-m', branch]
  )
}
