import React from 'react'
import { cn } from '@/lib/utils'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import { GitHistoryGraphSvg } from './git-history-graph-svg'
import { formatGitGraphTimestamp } from './git-history-format'
import { GitHistoryRefBadge } from './git-history-row'

const MAX_VISIBLE_REFS = 4

type GitGraphRowProps = React.HTMLAttributes<HTMLDivElement> & {
  viewModel: GitHistoryItemViewModel
  /** One width for every row so the description column lines up under the widest graph. */
  graphWidth: number
  selected: boolean
  preserveRefIds?: readonly string[]
}

/** One commit of the all-refs graph: lanes, refs and subject, then author, date and hash. */
export const GitGraphRow = React.forwardRef<HTMLDivElement, GitGraphRowProps>(function GitGraphRow(
  { viewModel, graphWidth, selected, preserveRefIds, className, ...rootProps },
  ref
): React.JSX.Element {
  const item = viewModel.historyItem
  const refs = dedupeRemoteTrackingRefs(item.references ?? [], { preserveRefIds })
  const hiddenRefCount = Math.max(0, refs.length - MAX_VISIBLE_REFS)

  return (
    <div
      {...rootProps}
      ref={ref}
      role="option"
      aria-selected={selected}
      data-current={selected ? 'true' : undefined}
      data-testid="git-graph-row"
      className={cn(
        'flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 px-2 text-xs hover:bg-accent/60 data-[current=true]:bg-accent data-[current=true]:shadow-[inset_0_0_0_1px_var(--border)]',
        className
      )}
    >
      <div className="h-6 shrink-0 overflow-hidden" style={{ width: graphWidth }}>
        <GitHistoryGraphSvg viewModel={viewModel} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {refs.slice(0, MAX_VISIBLE_REFS).map((itemRef) => (
          <GitHistoryRefBadge
            key={itemRef.id}
            itemRef={itemRef}
            withCategoryIcon
            className="max-w-[14rem] shrink-0 bg-background"
          />
        ))}
        {hiddenRefCount > 0 && (
          <span className="shrink-0 text-3xs text-muted-foreground">+{hiddenRefCount}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">{item.subject}</span>
      </div>
      <span className="hidden w-36 shrink-0 truncate text-muted-foreground md:block">
        {item.author}
      </span>
      <span className="hidden w-36 shrink-0 truncate text-muted-foreground tabular-nums lg:block">
        {formatGitGraphTimestamp(item.timestamp)}
      </span>
      <span className="w-14 shrink-0 font-mono text-2xs text-muted-foreground">
        {item.displayId ?? item.id.slice(0, 7)}
      </span>
    </div>
  )
})
