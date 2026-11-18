import { useAppStore } from '@/store'
import { useGitAnnotateStore } from './git-annotate-store'

/** Opens the Git graph tab of the worktree with `commitId` selected. */
export function openCommitInGitGraph(worktreeId: string, commitId: string): void {
  useGitAnnotateStore.getState().focusGraphCommit(worktreeId, commitId)
  useAppStore.getState().openGitGraphTab(worktreeId)
}
