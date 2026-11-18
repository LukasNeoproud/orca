/** Long-lived branches the cleanup never offers, even when another branch contains them. */
export const GIT_PROTECTED_BRANCH_PATTERNS: readonly string[] = [
  'main',
  'master',
  'trunk',
  'develop',
  'development',
  'dev',
  'staging',
  'production',
  'release',
  'release/*',
  'releases/*'
]

export function isProtectedBranchName(name: string): boolean {
  return GIT_PROTECTED_BRANCH_PATTERNS.some((pattern) =>
    pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern
  )
}

/**
 * `merged`: was pushed and is all in the target. `never-pushed`: the same, but the remote never
 * had it, so it may only be a new branch with no work yet. `in-workspace`: merged but checked
 * out, so only removing that workspace can delete it.
 */
export type GitMergedBranchCategory = 'merged' | 'never-pushed' | 'in-workspace'

/** A local branch whose changes are all in the target branch on the remote. */
export type GitMergedBranch = {
  name: string
  head: string
  category: GitMergedBranchCategory
  /** The branch it tracks, while that still exists on the remote. */
  remote?: {
    remote: string
    branch: string
    /** The remote branch is at the same commit, so it is exactly as merged as the local one. */
    inSync: boolean
  }
  /** It tracked a remote branch that has since been deleted. */
  upstreamGone: boolean
  /** Set for `in-workspace`: where it is checked out. */
  worktreePath?: string
}

export type GitMergedBranchesResult = {
  /** The remote branch the list was checked against; null when the repository has none. */
  targetRef: string | null
  /** Every remote branch that can be the target, as full refs. */
  targets: string[]
  /** False when the remote could not be fetched, so remote branches may be out of date. */
  remoteFresh: boolean
  branches: GitMergedBranch[]
}

export type GitDeleteMergedBranchRequest = {
  name: string
  /** The commit the caller was shown; a branch that moved since is left alone. */
  head: string
  deleteRemote?: boolean
}

export type GitDeleteMergedBranchesResult = {
  deleted: string[]
  remoteDeleted: string[]
  failures: { name: string; scope: 'local' | 'remote'; error: string }[]
}

export const GIT_MERGED_BRANCH_DELETE_LIMIT = 200
/** Deleted branch tips are appended here, inside the repository's Git directory. */
export const GIT_DELETED_BRANCH_LOG_NAME = 'orca-deleted-branches.log'
