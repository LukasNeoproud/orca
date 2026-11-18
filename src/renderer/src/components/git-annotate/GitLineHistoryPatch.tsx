import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { formatGitHistoryTimestamp } from '@/components/right-sidebar/source-control/sync/git-history-format'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  GIT_LINE_HISTORY_MAX_PATCH_LINES,
  type GitLineHistoryItem
} from '../../../../shared/git-line-history'

/** One commit's change to the selected block, as the hunks Git reports for it. */
export function GitLineHistoryPatch({
  item,
  onOpenCommit
}: {
  item: GitLineHistoryItem
  onOpenCommit?: () => void
}): React.JSX.Element {
  const meta = [item.author, formatGitHistoryTimestamp(item.timestamp)].filter(Boolean).join(' · ')
  return (
    <div data-testid="git-line-history-patch" className="pb-1">
      {meta && <div className="py-0.5 pr-3 pl-9 text-2xs text-muted-foreground">{meta}</div>}
      <div className="scrollbar-sleek overflow-x-auto">
        <div className="min-w-max font-mono text-2xs leading-relaxed text-foreground">
          {item.patch.split('\n').map((line, index) => (
            <div
              // Patch lines repeat and never reorder, so the index is their identity.
              key={index}
              className={cn(
                'pr-3 pl-9 whitespace-pre',
                line.startsWith('+') && 'bg-[var(--diff-added-ground)]',
                line.startsWith('-') && 'bg-[var(--diff-removed-ground)]',
                line.startsWith('@@') && 'text-muted-foreground'
              )}
            >
              {line || ' '}
            </div>
          ))}
        </div>
      </div>
      {item.patchTruncated && (
        <div className="py-0.5 pr-3 pl-9 text-2xs text-muted-foreground">
          {translate(
            'gitAnnotate.patchTruncated',
            'Change shortened to its first {{value0}} lines.',
            { value0: GIT_LINE_HISTORY_MAX_PATCH_LINES }
          )}
        </div>
      )}
      {onOpenCommit && (
        <button
          type="button"
          className="flex w-full items-center gap-1 py-1 pr-3 pl-9 text-left text-2xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          onClick={onOpenCommit}
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span>{translate('gitAnnotate.openCommit', 'Open the whole commit')}</span>
        </button>
      )}
    </div>
  )
}
