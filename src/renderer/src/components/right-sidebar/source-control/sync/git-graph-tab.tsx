import { useCallback } from 'react'
import type React from 'react'
import { useAppStore } from '@/store'
import { useRepoById, useWorktreeById } from '@/store/selectors'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { translate } from '@/i18n/i18n'
import { GIT_HISTORY_MAX_LIMIT, type GitHistoryResult } from '../../../../../../shared/git-history'
import { isFolderRepo } from '../../../../../../shared/repo-kind'
import { requireGitOwnerTarget, useWorktreeGitOwnerTarget } from '../../worktree-git-owner-target'
import { GitGraphView } from './git-graph-view'
import { useGitHistoryCommitActions } from './use-git-history-commit-actions'

const openInSameGroup = (): undefined => undefined

/** The commit graph filling a workspace tab; it loads on its own, without the Source Control panel. */
export function GitGraphTab({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const worktree = useWorktreeById(worktreeId)
  const worktreePath = worktree?.path ?? null
  const repo = useRepoById(worktree?.repoId ?? null)
  const isFolder = repo ? isFolderRepo(repo) : false
  const target = useWorktreeGitOwnerTarget(worktreeId)
  // The panel's compare base, when it has one; without it only the base-ref highlight is lost.
  const baseRef = useAppStore(
    (state) => state.gitBranchCompareSummaryByWorktree[worktreeId]?.baseRef ?? null
  )
  const { loadCommitFiles, openHistoryCommitDiff, openCommitFile, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId: worktreeId,
      worktreePath,
      activeRepoTarget: target,
      resolveSplitTargetGroupId: openInSameGroup
    })
  const loadHistory = useCallback(
    async (skip: number): Promise<GitHistoryResult> => {
      if (!worktreePath || isFolder) {
        throw new Error(
          translate('components.right-sidebar.gitGraph.noRepository', 'No Git repository is open')
        )
      }
      return getRuntimeGitHistory(
        {
          target: requireGitOwnerTarget(target),
          worktreeId,
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined
        },
        { limit: GIT_HISTORY_MAX_LIMIT, baseRef, scope: 'all', skip }
      )
    },
    [baseRef, isFolder, target, worktreeId, worktreePath]
  )

  return (
    <div data-testid="git-graph-tab" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <GitGraphView
        onLoadHistory={loadHistory}
        onOpenCommit={(item) => void openHistoryCommitDiff(item)}
        onLoadCommitFiles={loadCommitFiles}
        onOpenCommitFile={openCommitFile}
        onCommitAction={handleCommitAction}
        renderHeading={(title, description) => (
          <>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{description}</p>
          </>
        )}
      />
    </div>
  )
}
