import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels
} from '../../../../../../shared/git-history-graph'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import {
  GitHistoryCommitContextMenu,
  type GitHistoryCommitAction
} from './git-history-commit-context-menu'
import type { GitHistoryCommitFilesState } from './git-history-commit-files'
import { GIT_HISTORY_SWIMLANE_HEIGHT, GIT_HISTORY_SWIMLANE_WIDTH } from './git-history-graph-svg'
import { GitGraphCommitDetails } from './git-graph-commit-details'
import { GitGraphRow } from './git-graph-row'
import { useAllRefsGitGraph } from './use-all-refs-git-graph'

// Past this many lanes the graph is clipped so it cannot crowd out the commit subjects.
const MAX_GRAPH_LANES = 24
const PAGE_ROWS = 10

export type GitGraphDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLoadHistory: (skip: number) => Promise<GitHistoryResult>
  onOpenCommit?: (item: GitHistoryItem) => void
  onLoadCommitFiles?: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  onOpenCommitFile?: (
    item: GitHistoryItem,
    entry: GitBranchChangeEntry,
    event?: SourceControlRowOpenEvent
  ) => void
  onCommitAction?: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
}

/** Every branch, remote branch and tag of the repository as one commit graph. */
export function GitGraphDialog({
  open,
  onOpenChange,
  onLoadHistory,
  onOpenCommit,
  onLoadCommitFiles,
  onOpenCommitFile,
  onCommitAction
}: GitGraphDialogProps): React.JSX.Element {
  const { state, refresh, loadMore } = useAllRefsGitGraph({ open, load: onLoadHistory })
  const head = state.head
  const viewModels = useMemo(
    () =>
      head
        ? buildGitHistoryViewModels(
            state.items,
            buildDefaultGitHistoryColorMap(head),
            head.currentRef,
            head.remoteRef,
            head.baseRef
          )
        : [],
    [head, state.items]
  )
  const graphWidth = useMemo(() => {
    let lanes = 1
    for (const viewModel of viewModels) {
      lanes = Math.max(lanes, viewModel.inputSwimlanes.length, viewModel.outputSwimlanes.length)
    }
    return GIT_HISTORY_SWIMLANE_WIDTH * (Math.min(lanes, MAX_GRAPH_LANES) + 1)
  }, [viewModels])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = viewModels.findIndex((row) => row.historyItem.id === selectedId)
  const selectedItem = viewModels[selectedIndex]?.historyItem
  const [filesByCommit, setFilesByCommit] = useState<Record<string, GitHistoryCommitFilesState>>({})

  // A reload can rewrite history under the same ids, so cached file lists go with it.
  const [filesHead, setFilesHead] = useState(head)
  if (filesHead !== head) {
    setFilesHead(head)
    setFilesByCommit({})
  }

  const selectedFilesState = selectedItem ? filesByCommit[selectedItem.id] : undefined
  useEffect(() => {
    if (!selectedItem || !onLoadCommitFiles || selectedFilesState) {
      return
    }
    const id = selectedItem.id
    setFilesByCommit((previous) => ({ ...previous, [id]: { status: 'loading' } }))
    onLoadCommitFiles(selectedItem)
      .then((entries) => {
        setFilesByCommit((previous) => ({ ...previous, [id]: { status: 'ready', entries } }))
      })
      .catch((error: unknown) => {
        setFilesByCommit((previous) => ({
          ...previous,
          [id]: {
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : translate(
                    'auto.components.right.sidebar.GitHistoryPanel.6d1e0a7c3b',
                    'Failed to load commit files'
                  )
          }
        }))
      })
  }, [onLoadCommitFiles, selectedFilesState, selectedItem])

  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: viewModels.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => GIT_HISTORY_SWIMLANE_HEIGHT,
    getItemKey: (index) => viewModels[index]?.historyItem.id ?? index,
    overscan: 12,
    initialRect: { width: 1024, height: 480 }
  })
  const virtualRows = virtualizer.getVirtualItems()
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? -1

  // Why not after an error: retrying on every scroll frame would hammer a failing host.
  const shouldLoadMore =
    state.hasMore && !state.loadingMore && !state.error && lastVisibleIndex >= viewModels.length - 1
  useEffect(() => {
    if (shouldLoadMore) {
      loadMore()
    }
  }, [loadMore, shouldLoadMore])

  const close = useCallback((): void => onOpenChange(false), [onOpenChange])
  const openCommit = useCallback(
    (item: GitHistoryItem): void => {
      if (!onOpenCommit) {
        return
      }
      onOpenCommit(item)
      close()
    },
    [close, onOpenCommit]
  )
  const runCommitAction = useCallback(
    (action: GitHistoryCommitAction, item: GitHistoryItem): void => {
      onCommitAction?.(action, item)
      // These open a tab behind the window; copying leaves the user where they were.
      if (action === 'open-remote' || action === 'explain') {
        close()
      }
    },
    [close, onCommitAction]
  )

  const selectIndex = (index: number): void => {
    const row = viewModels[Math.min(viewModels.length - 1, Math.max(0, index))]
    if (!row) {
      return
    }
    setSelectedId(row.historyItem.id)
    virtualizer.scrollToIndex(viewModels.indexOf(row), { align: 'auto' })
  }
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const steps: Record<string, number> = {
      ArrowDown: selectedIndex + 1,
      ArrowUp: selectedIndex - 1,
      PageDown: selectedIndex + PAGE_ROWS,
      PageUp: selectedIndex - PAGE_ROWS,
      Home: 0,
      End: viewModels.length - 1
    }
    if (event.key in steps) {
      event.preventDefault()
      selectIndex(steps[event.key] ?? 0)
    } else if (event.key === 'Enter' && selectedItem) {
      event.preventDefault()
      openCommit(selectedItem)
    }
  }

  const title = translate('components.right-sidebar.gitGraph.title', 'Git graph')
  const refreshLabel = translate('components.right-sidebar.gitGraph.refresh', 'Refresh graph')
  const loading = state.status === 'loading'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="git-graph-dialog"
        className="flex h-[90vh] max-w-[94vw] flex-col sm:max-w-7xl"
      >
        <div className="flex items-center gap-2 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <div className="min-w-0 flex-1">
            <DialogDescription>
              {state.allRefsSupported
                ? translate(
                    'components.right-sidebar.gitGraph.description',
                    'Commits of every local branch, remote branch and tag.'
                  )
                : translate(
                    'components.right-sidebar.gitGraph.currentBranchOnly',
                    'This host runs an older Orca, so only the current branch is shown.'
                  )}
            </DialogDescription>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {translate('components.right-sidebar.gitGraph.count', '{{value0}} commits', {
              value0: `${state.items.length}${state.hasMore ? '+' : ''}`
            })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={refreshLabel}
                disabled={loading}
                onClick={refresh}
              >
                <RefreshCw className={cn(loading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {refreshLabel}
            </TooltipContent>
          </Tooltip>
        </div>

        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={title}
          aria-activedescendant={selectedItem ? `git-graph-row-${selectedItem.id}` : undefined}
          className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={handleListKeyDown}
        >
          {loading && viewModels.length === 0 && (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              {translate(
                'auto.components.right.sidebar.GitHistoryPanel.781a8bcf7b',
                'Loading graph...'
              )}
            </div>
          )}
          {state.status === 'ready' && viewModels.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.GitHistoryPanel.cf7cad58d2',
                'No commits yet'
              )}
            </div>
          )}
          <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualRows.map((virtualRow) => {
              const viewModel = viewModels[virtualRow.index]
              if (!viewModel) {
                return null
              }
              const item = viewModel.historyItem
              const row = (
                <GitGraphRow
                  id={`git-graph-row-${item.id}`}
                  viewModel={viewModel}
                  graphWidth={graphWidth}
                  selected={item.id === selectedId}
                  preserveRefIds={head?.baseRef ? [head.baseRef.id] : undefined}
                  className="absolute top-0 left-0"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  aria-posinset={virtualRow.index + 1}
                  aria-setsize={viewModels.length}
                  onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => openCommit(item)}
                  onContextMenu={() => setSelectedId(item.id)}
                />
              )
              return onCommitAction ? (
                <ContextMenu key={virtualRow.key}>
                  <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                  <GitHistoryCommitContextMenu item={item} onAction={runCommitAction} />
                </ContextMenu>
              ) : (
                <React.Fragment key={virtualRow.key}>{row}</React.Fragment>
              )
            })}
          </div>
          {state.loadingMore && (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              {translate('components.right-sidebar.gitGraph.loadingMore', 'Loading more commits…')}
            </div>
          )}
          {state.error && (
            <div className="flex items-center gap-2 p-2 text-xs text-destructive">
              <span className="min-w-0 flex-1 break-words">{state.error}</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={state.status === 'error' ? refresh : loadMore}
              >
                {translate('components.right-sidebar.gitGraph.retry', 'Retry')}
              </Button>
            </div>
          )}
        </div>

        {selectedItem ? (
          <GitGraphCommitDetails
            item={selectedItem}
            filesState={selectedFilesState ?? { status: 'loading' }}
            onCopyHash={() => onCommitAction?.('copy-hash', selectedItem)}
            onOpenFile={(entry, event) => {
              onOpenCommitFile?.(selectedItem, entry, event)
              close()
            }}
            onOpenAll={onOpenCommit ? () => openCommit(selectedItem) : undefined}
          />
        ) : (
          <div className="shrink-0 text-xs text-muted-foreground">
            {translate(
              'components.right-sidebar.gitGraph.selectHint',
              'Select a commit to see its message and changed files. Double-click to open its diff.'
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
