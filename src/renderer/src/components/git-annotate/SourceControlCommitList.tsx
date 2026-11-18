import React, { useCallback, useMemo, useState } from 'react'
import { History, X } from 'lucide-react'
import {
  GitHistoryPanel,
  type GitHistoryPanelState
} from '@/components/right-sidebar/source-control/sync/git-history-panel'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { GitHistoryItem } from '../../../../shared/git-history'
import type { GitLineHistoryResult } from '../../../../shared/git-line-history'
import { useGitAnnotateStore, type GitLineHistoryView } from './git-annotate-store'
import { GitLineHistoryPatch } from './GitLineHistoryPatch'
import { showGitLineHistory } from './show-git-line-history'

type GitHistoryPanelProps = React.ComponentProps<typeof GitHistoryPanel>

const NO_FILES = async (): Promise<never[]> => []
const NO_FILE_OPEN = (): void => {}

function toPanelState(view: GitLineHistoryView): GitHistoryPanelState {
  if (view.state.status === 'loading') {
    return { status: 'loading' }
  }
  if (view.state.status === 'error') {
    return { status: 'error', error: view.state.error }
  }
  const { items, hasMore, limit } = view.state.result
  return {
    status: 'ready',
    result: { items, hasMore, limit, hasIncomingChanges: false, hasOutgoingChanges: false }
  }
}

/** Why the list is empty, for the statuses that are answers rather than failures. */
function emptyReason(status: GitLineHistoryResult['status']): string | null {
  switch (status) {
    case 'uncommitted':
      return translate('gitAnnotate.historyUncommitted', 'These lines are not committed yet.')
    case 'untracked':
      return translate('gitAnnotate.historyUntracked', 'This file is not committed yet.')
    case 'no-commits':
      return translate('gitAnnotate.historyNoCommits', 'This repository has no commits yet.')
    case 'ready':
      return null
  }
}

function GitLineHistoryPanel({
  worktreeId,
  view,
  panelProps
}: {
  worktreeId: string
  view: GitLineHistoryView
  panelProps: GitHistoryPanelProps
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const state = useMemo(() => toPanelState(view), [view])
  const result = view.state.status === 'ready' ? view.state.result : null
  const { onOpenCommit } = panelProps
  const renderBlockChange = useCallback(
    (item: GitHistoryItem): React.ReactNode => {
      const change = result?.items.find((entry) => entry.id === item.id)
      return change ? (
        <GitLineHistoryPatch
          item={change}
          onOpenCommit={onOpenCommit ? () => onOpenCommit(item) : undefined}
        />
      ) : null
    },
    [onOpenCommit, result]
  )
  const { startLine, endLine } = view.range
  const file = basename(view.context.relativePath)
  const title =
    startLine === endLine
      ? translate('gitAnnotate.historyTitleLine', 'History of {{file}}, line {{start}}', {
          file,
          start: startLine
        })
      : translate('gitAnnotate.historyTitle', 'History of {{file}}, lines {{start}}–{{end}}', {
          file,
          start: startLine,
          end: endLine
        })
  const clearLabel = translate('gitAnnotate.historyClear', 'Show all commits')
  const reason = result ? emptyReason(result.status) : null

  return (
    <>
      <div
        data-testid="git-line-history-banner"
        className="flex items-center gap-1.5 border-b border-border py-1 pr-2 pl-3 text-xs text-muted-foreground"
      >
        <History className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={view.context.relativePath}>
          {title}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={clearLabel}
              onClick={() => useGitAnnotateStore.getState().setLineHistory(worktreeId, null)}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {clearLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      {reason && <div className="px-3 pt-1 text-2xs text-muted-foreground">{reason}</div>}
      <GitHistoryPanel
        state={state}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onRefresh={() => void showGitLineHistory(view.context, view.range)}
        onOpenCommit={onOpenCommit}
        // Why both: the panel only lets a commit expand when it can list and open files.
        onLoadCommitFiles={NO_FILES}
        onOpenCommitFile={NO_FILE_OPEN}
        onCommitAction={panelProps.onCommitAction}
        renderExpandedCommit={renderBlockChange}
      />
    </>
  )
}

/** The Source Control commit list: the log, or the history of a block picked in the editor. */
export function SourceControlCommitList({
  worktreeId,
  ...panelProps
}: GitHistoryPanelProps & { worktreeId: string | null | undefined }): React.JSX.Element | null {
  const view = useGitAnnotateStore((state) =>
    worktreeId ? state.lineHistoryByWorktree[worktreeId] : undefined
  )
  if (!worktreeId || !view) {
    return <GitHistoryPanel {...panelProps} />
  }
  return <GitLineHistoryPanel worktreeId={worktreeId} view={view} panelProps={panelProps} />
}
