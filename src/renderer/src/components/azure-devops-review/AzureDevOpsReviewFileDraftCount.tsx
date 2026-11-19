import { useCallback, useMemo } from 'react'
import { Bot, MessageSquareDashed } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { CombinedDiffFileTreeEntry } from '../editor/combined-diff/resolve-changes/combined-diff-section-identity'
import type { AzureDevOpsReviewDraft } from '../../../../shared/azure-devops-review-types'
import {
  countAzureDevOpsReviewFileDrafts,
  type AzureDevOpsReviewFileDraftCount as FileDraftCount
} from './azure-devops-review-file-draft-counts'

function fileDraftCountLabel({ total, agent }: FileDraftCount): string {
  return agent > 0
    ? translate(
        'azureDevOpsReview.fileDraftsWithAgent',
        'Unpublished drafts: {{value0}}, from the agent: {{value1}}',
        { value0: total, value1: agent }
      )
    : translate('azureDevOpsReview.fileDrafts', 'Unpublished drafts: {{value0}}', {
        value0: total
      })
}

/** Unpublished drafts on one file-tree row: yours and the agent's, each with its own icon. */
export function AzureDevOpsReviewFileDraftCount({
  count
}: {
  count: FileDraftCount
}): React.JSX.Element {
  const label = fileDraftCountLabel(count)
  const own = count.total - count.agent
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-file-draft-count={`${own}/${count.agent}`}
          className="flex shrink-0 items-center gap-1.5 text-3xs leading-none tabular-nums text-muted-foreground"
        >
          <span className="sr-only">{label}</span>
          {own > 0 ? (
            <span aria-hidden className="flex items-center gap-0.5">
              <MessageSquareDashed className="size-3" />
              {own}
            </span>
          ) : null}
          {count.agent > 0 ? (
            <span aria-hidden className="flex items-center gap-0.5">
              <Bot className="size-3" />
              {count.agent}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Stable file-tree annotation that shows each file's unpublished draft count. */
export function useAzureDevOpsReviewFileDraftAnnotation(
  drafts: readonly AzureDevOpsReviewDraft[]
): (entry: CombinedDiffFileTreeEntry) => React.ReactNode {
  const counts = useMemo(() => countAzureDevOpsReviewFileDrafts(drafts), [drafts])
  return useCallback(
    (entry: CombinedDiffFileTreeEntry) => {
      const count = counts.get(entry.path)
      return count ? <AzureDevOpsReviewFileDraftCount count={count} /> : null
    },
    [counts]
  )
}
