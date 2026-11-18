/** One row of the branch list beside the commit graph. */
export type GitBranchEntry = {
  kind: 'local' | 'remote'
  /** `feature/x` for a local branch, `origin/feature/x` for a remote one. */
  name: string
  head: string
  subject: string
  /** Committer date of the tip, epoch milliseconds. */
  timestamp?: number
  /** Checked out in the worktree the list was read from. */
  current: boolean
  /** A long-lived branch the list refuses to delete or rename. */
  protected: boolean
  /** Local only: the worktree that has it checked out. */
  worktreePath?: string
  /** Local only: the branch it tracks. */
  upstream?: { name: string; ahead: number; behind: number; gone: boolean }
}

export type GitBranchListResult = { branches: GitBranchEntry[] }

export type GitDeleteBranchRequest = {
  kind: 'local' | 'remote'
  name: string
  /** The commit the caller was shown; a branch that moved since is left alone. */
  head: string
  /** Local only: also delete the tracked remote branch when it is at the same commit. */
  deleteRemote?: boolean
}

export type GitDeleteBranchResult = {
  remoteDeleted: boolean
  /** The local branch is gone but its remote branch could not be deleted. */
  remoteError?: string
}
