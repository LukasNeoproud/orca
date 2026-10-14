import { useMemo, useState } from 'react'
import { FileText, ScrollText } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { CombinedDiffFileTree } from '../editor/combined-diff/browse-files/combined-diff-file-tree'
import { getCombinedDiffBranchEntriesInTreeOrder } from '../editor/combined-diff/browse-files/combined-diff-file-tree-filter'
import {
  getCombinedDiffFileTreeSectionKey,
  type CombinedDiffFileTreeEntry
} from '../editor/combined-diff/resolve-changes/combined-diff-section-identity'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewFileDiffPane } from './AzureDevOpsReviewFileDiffPane'
import { AzureDevOpsReviewAllChanges } from './AzureDevOpsReviewAllChanges'
import { AzureDevOpsReviewIconButton } from './AzureDevOpsReviewIconButton'
import { azureDevOpsChangeToBranchEntry } from './azure-devops-review-diff-sections'

const NO_VIEWED = new Set<string>()
const VIEW_MODE_KEY = 'orca.azureDevOpsReview.filesViewMode'

type FilesViewMode = 'all' | 'file'

function readViewMode(): FilesViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'file' ? 'file' : 'all'
  } catch {
    return 'all'
  }
}

function storeViewMode(mode: FilesViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    // Only a remembered preference; the default view still works.
  }
}

/** Azure DevOps-style Files view: all changes in one scroll, or the tree with one file's diff. */
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
    () =>
      getCombinedDiffBranchEntriesInTreeOrder(
        'commit',
        detail.changes.map(azureDevOpsChangeToBranchEntry)
      ),
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
  const [viewMode, setViewMode] = useState<FilesViewMode>(readViewMode)
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

  const switchMode = (mode: FilesViewMode): void => {
    setViewMode(mode)
    storeViewMode(mode)
  }
  const viewModeToggle =
    viewMode === 'all' ? (
      <AzureDevOpsReviewIconButton
        label={translate('azureDevOpsReview.singleFileView', 'Show one file at a time')}
        onClick={() => switchMode('file')}
      >
        <FileText className="size-3.5" />
      </AzureDevOpsReviewIconButton>
    ) : (
      <AzureDevOpsReviewIconButton
        label={translate('azureDevOpsReview.allChangesView', 'Show all changes in one scroll')}
        onClick={() => switchMode('all')}
      >
        <ScrollText className="size-3.5" />
      </AzureDevOpsReviewIconButton>
    )

  if (viewMode === 'all') {
    return (
      <AzureDevOpsReviewAllChanges
        detail={detail}
        entries={entries}
        changeByPath={changeByPath}
        repoPath={repoPath}
        viewModeToggle={viewModeToggle}
        onChanged={onChanged}
      />
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
          selected
            ? getCombinedDiffFileTreeSectionKey('commit', azureDevOpsChangeToBranchEntry(selected))
            : null
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
          viewModeToggle={viewModeToggle}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  )
}
