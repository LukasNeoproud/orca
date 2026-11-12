import type React from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import { GitHistoryCommitFiles, type GitHistoryCommitFilesState } from './git-history-commit-files'
import { formatGitHistoryTimestamp } from './git-history-format'
import { GitHistoryRefBadge } from './git-history-row'

/** The selected commit of the graph window: full message and identity beside its changed files. */
export function GitGraphCommitDetails({
  item,
  filesState,
  onCopyHash,
  onOpenFile,
  onOpenAll
}: {
  item: GitHistoryItem
  filesState: GitHistoryCommitFilesState
  onCopyHash: () => void
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  const body = item.message.split(/\r?\n/).slice(1).join('\n').trim()
  const author = [item.author, item.authorEmail ? `<${item.authorEmail}>` : '']
    .filter(Boolean)
    .join(' ')
  const copyLabel = translate(
    'auto.components.right.sidebar.GitHistoryCommitContextMenu.8c2d5fab13',
    'Copy commit hash'
  )

  return (
    <div
      data-testid="git-graph-commit-details"
      className="grid h-[34%] min-h-32 shrink-0 grid-cols-1 overflow-hidden rounded-md border border-border md:grid-cols-2"
    >
      <div className="scrollbar-sleek min-h-0 space-y-2 overflow-y-auto p-3 text-xs">
        <div className="text-sm font-medium text-foreground">{item.subject}</div>
        {(item.references?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.references?.map((itemRef) => (
              <GitHistoryRefBadge
                key={itemRef.id}
                itemRef={itemRef}
                withCategoryIcon
                className="max-w-[20rem] bg-background"
              />
            ))}
          </div>
        )}
        <div className="text-muted-foreground">
          {[author, formatGitHistoryTimestamp(item.timestamp)].filter(Boolean).join(' · ')}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="min-w-0 truncate font-mono text-2xs">{item.id}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={copyLabel}
                onClick={onCopyHash}
              >
                <Copy />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {copyLabel}
            </TooltipContent>
          </Tooltip>
        </div>
        {body && <div className="break-words whitespace-pre-wrap text-foreground">{body}</div>}
      </div>
      <div className="scrollbar-sleek min-h-0 overflow-y-auto border-t border-border md:border-t-0 md:border-l">
        <GitHistoryCommitFiles state={filesState} onOpenFile={onOpenFile} onOpenAll={onOpenAll} />
      </div>
    </div>
  )
}
