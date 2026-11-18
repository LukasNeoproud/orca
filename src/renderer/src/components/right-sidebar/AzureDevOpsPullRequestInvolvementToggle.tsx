import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import {
  isReviewInvolvementFilter,
  type ReviewInvolvementFilter
} from '../../../../shared/azure-devops-review-groups'

const OPTIONS: readonly { value: ReviewInvolvementFilter; label: () => string }[] = [
  { value: 'all', label: () => translate('azureDevOpsReview.involvementAll', 'All') },
  {
    value: 'awaiting-my-review',
    label: () => translate('azureDevOpsReview.involvementAwaitingMe', 'Waiting for me')
  },
  { value: 'mine', label: () => translate('azureDevOpsReview.involvementMine', 'Mine') }
]

export function AzureDevOpsPullRequestInvolvementToggle({
  value,
  counts,
  onChange
}: {
  value: ReviewInvolvementFilter
  /** Pull requests each choice would show under the other filters. */
  counts: Record<ReviewInvolvementFilter, number>
  onChange: (value: ReviewInvolvementFilter) => void
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      // Why guarded: Radix reports '' when the pressed item is clicked again; one choice stays on.
      onValueChange={(next) => {
        if (isReviewInvolvementFilter(next)) {
          onChange(next)
        }
      }}
      aria-label={translate('azureDevOpsReview.involvementFilter', 'Filter by my involvement')}
      className="w-full"
    >
      {/* Sized by label, so the longest choice is the last to truncate in a narrow sidebar. */}
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="grow">
          <span className="min-w-0 truncate text-xs">{option.label()}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{counts[option.value]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
