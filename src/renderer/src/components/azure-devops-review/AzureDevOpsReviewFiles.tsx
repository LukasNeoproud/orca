import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { CombinedDiffFileTree } from '../editor/combined-diff/browse-files/combined-diff-file-tree'
import { getCombinedDiffBranchEntriesInTreeOrder } from '../editor/combined-diff/browse-files/combined-diff-file-tree-filter'
import {
  getCombinedDiffFileTreeSectionKey,
  type CombinedDiffFileTreeEntry
} from '../editor/combined-diff/resolve-changes/combined-diff-section-identity'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewFileDiffPane } from './AzureDevOpsReviewFileDiffPane'

const NO_VIEWED = new Set<string>()

function toBranchEntry(change: AzureDevOpsReviewChange): GitBranchChangeEntry {
  const status =
    change.changeType === 'add'
      ? 'added'
      : change.changeType === 'delete'
        ? 'deleted'
        : change.changeType === 'rename'
          ? 'renamed'
          : 'modified'
  return {
    path: change.path,
    status,
    ...(change.originalPath ? { oldPath: change.originalPath } : {})
  }
}

/** Azure DevOps-style Files view: file tree on the left, one file's diff on the right. */
export function AzureDevOpsReviewFiles({
  detail,
  onChanged
}: {
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const repoPath = useAppStore((s) => {
    const repoId = detail.reviewWorktree?.repoId
    return (repoId ? s.repos.find((repo) => repo.id === repoId)?.path : undefined) ?? ''
  })
  const entries = useMemo(
    () => getCombinedDiffBranchEntriesInTreeOrder('commit', detail.changes.map(toBranchEntry)),
    [detail.changes]
  )
  const sectionIndexByKey = useMemo(
    () =>
      new Map(
        entries.map((entry, index) => [getCombinedDiffFileTreeSectionKey('commit', entry), index])
      ),
    [entries]
  )
  const changeByPath = useMemo(
    () => new Map(detail.changes.map((change) => [change.path, change])),
    [detail.changes]
  )
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  // Why: open the first file in tree order, as Azure DevOps does, instead of an empty pane.
  const selected =
    (selectedPath ? changeByPath.get(selectedPath) : undefined) ??
    (entries[0] ? changeByPath.get(entries[0].path) : undefined) ??
    null

  if (detail.changes.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        {translate('azureDevOpsReview.noChanges', 'This pull request has no file changes.')}
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <CombinedDiffFileTree
        mode="commit"
        worktreePath={repoPath}
        entries={entries}
        sectionIndexByKey={sectionIndexByKey}
        activeSectionKey={
          selected ? getCombinedDiffFileTreeSectionKey('commit', toBranchEntry(selected)) : null
        }
        viewedSectionKeys={NO_VIEWED}
        collapsed={treeCollapsed}
        onCollapsedChange={setTreeCollapsed}
        onNavigate={(entry: CombinedDiffFileTreeEntry) => setSelectedPath(entry.path)}
      />
      {selected ? (
        <AzureDevOpsReviewFileDiffPane
          detail={detail}
          change={selected}
          treeCollapsed={treeCollapsed}
          onShowTree={() => setTreeCollapsed(false)}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  )
}
