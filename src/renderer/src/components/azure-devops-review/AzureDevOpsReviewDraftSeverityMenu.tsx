import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import {
  isReviewFindingSeverity,
  REVIEW_FINDING_SEVERITIES,
  type ReviewFindingSeverity
} from '../../../../shared/review-finding'
import { findingSeverityLabel } from './azure-devops-review-finding-labels'
import { AzureDevOpsReviewSeverityMark } from './AzureDevOpsReviewFindingMarks'

const NO_SEVERITY = 'none'

/** The severity of an unpublished draft, which the user may set, change or remove. */
export function AzureDevOpsReviewDraftSeverityMenu({
  severity,
  disabled,
  onChange
}: {
  severity: ReviewFindingSeverity | null
  disabled: boolean
  onChange: (severity: ReviewFindingSeverity | null) => void
}): React.JSX.Element {
  const none = translate('azureDevOpsReview.severityNone', 'No severity')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          aria-label={translate('azureDevOpsReview.severityChange', 'Severity: {{value0}}', {
            value0: severity ? findingSeverityLabel(severity) : none
          })}
        >
          {severity ? (
            <AzureDevOpsReviewSeverityMark severity={severity} />
          ) : (
            <span className="text-muted-foreground">{none}</span>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={severity ?? NO_SEVERITY}
          onValueChange={(value) => {
            const next = isReviewFindingSeverity(value) ? value : null
            if (next !== severity) {
              onChange(next)
            }
          }}
        >
          {REVIEW_FINDING_SEVERITIES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {findingSeverityLabel(option)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value={NO_SEVERITY}>{none}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
