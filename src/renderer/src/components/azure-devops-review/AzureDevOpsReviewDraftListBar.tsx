import { EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  EMPTY_REVIEW_FINDING_FILTER,
  isReviewFindingSortOrder
} from '../../../../shared/review-finding-list-view'
import { AzureDevOpsReviewDraftFilterMenu } from './AzureDevOpsReviewDraftFilterMenu'
import type { AzureDevOpsReviewDraftList } from './use-azure-devops-review-draft-list'

function hiddenNotice(list: AzureDevOpsReviewDraftList, selectedHidden: number): string {
  const value0 = list.hidden.length
  const value1 = list.shown.length + list.hidden.length
  const hidden =
    list.hiddenWithoutSeverity > 0
      ? translate(
          'azureDevOpsReview.draftsFilterHiddenUnrated',
          'The filter hides {{value0}} of {{value1}} drafts, {{value2}} of them without severity.',
          { value0, value1, value2: list.hiddenWithoutSeverity }
        )
      : translate(
          'azureDevOpsReview.draftsFilterHidden',
          'The filter hides {{value0}} of {{value1}} drafts.',
          { value0, value1 }
        )
  if (selectedHidden === 0) {
    return hidden
  }
  const selected = translate(
    'azureDevOpsReview.draftsFilterHiddenSelected',
    'Hidden drafts selected for publishing: {{value0}}.',
    { value0: selectedHidden }
  )
  return `${hidden} ${selected}`
}

/**
 * Sort order and filter of the drafts list. Whatever the filter hides is counted next to it, so a
 * draft written by hand is never out of sight without a word.
 */
export function AzureDevOpsReviewDraftListBar({
  list,
  selectedHidden
}: {
  list: AzureDevOpsReviewDraftList
  /** Hidden drafts that are still selected and would be published. */
  selectedHidden: number
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={list.order}
        onValueChange={(value) => {
          if (isReviewFindingSortOrder(value)) {
            list.setOrder(value)
          }
        }}
      >
        <SelectTrigger
          size="xs"
          aria-label={translate('azureDevOpsReview.draftsSort', 'Sort drafts')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="priority">
            {translate('azureDevOpsReview.draftsSortPriority', 'By priority')}
          </SelectItem>
          <SelectItem value="file">
            {translate('azureDevOpsReview.draftsSortFile', 'By file')}
          </SelectItem>
        </SelectContent>
      </Select>
      <AzureDevOpsReviewDraftFilterMenu
        filter={list.filter}
        facets={list.facets}
        onChange={list.setFilter}
      />
      {list.hidden.length > 0 ? (
        <div
          role="status"
          className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground"
        >
          <EyeOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{hiddenNotice(list, selectedHidden)}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => list.setFilter(EMPTY_REVIEW_FINDING_FILTER)}
          >
            {translate('azureDevOpsReview.draftsFilterClear', 'Clear filters')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
