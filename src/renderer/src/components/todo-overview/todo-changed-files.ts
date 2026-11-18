import type { GitStatusEntry } from '../../../../shared/git-status-types'
import type {
  GitBranchChangeEntry,
  GitBranchCompareSummary
} from '../../../../shared/git-diff-compare-types'

export type TodoChangedFiles = {
  /** Workspace-relative paths that still exist, sorted. */
  paths: string[]
  /** The base the branch was compared with, or null when only uncommitted changes are known. */
  baseRef: string | null
}

/**
 * Files changed against the branch base: the committed changes from the branch compare Orca already
 * ran (when it is ready) plus the uncommitted ones from git status. Deleted files cannot hold TODOs.
 */
export function collectTodoChangedFiles(
  statusEntries: readonly GitStatusEntry[] | undefined,
  branchSummary: GitBranchCompareSummary | null | undefined,
  branchEntries: readonly GitBranchChangeEntry[] | undefined
): TodoChangedFiles {
  const paths = new Set<string>()
  const baseRef = branchSummary?.status === 'ready' ? branchSummary.baseRef : null
  if (baseRef) {
    for (const entry of branchEntries ?? []) {
      if (entry.status !== 'deleted') {
        paths.add(entry.path)
      }
    }
  }
  const present = new Set<string>()
  const deleted = new Set<string>()
  for (const entry of statusEntries ?? []) {
    // Submodule-internal rows name files of another repository.
    if (entry.submoduleRoot) {
      continue
    }
    ;(entry.status === 'deleted' ? deleted : present).add(entry.path)
  }
  for (const path of present) {
    paths.add(path)
  }
  // A staged delete with an untracked re-create still leaves the file on disk.
  for (const path of deleted) {
    if (!present.has(path)) {
      paths.delete(path)
    }
  }
  return { paths: [...paths].sort(), baseRef }
}
