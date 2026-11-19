import { ListFilter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import {
  countReviewFindingFilters,
  EMPTY_REVIEW_FINDING_FILTER,
  REVIEW_FINDING_UNRATED,
  type ReviewFindingCertaintyFilterValue,
  type ReviewFindingFacets,
  type ReviewFindingFilter,
  type ReviewFindingSeverityFilterValue
} from '../../../../shared/review-finding-list-view'
import { azureDevOpsReviewDraftAuthorLabel } from './azure-devops-review-draft-list'
import { findingCertaintyLabel, findingSeverityLabel } from './azure-devops-review-finding-labels'

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

function severityOptionLabel(value: ReviewFindingSeverityFilterValue): string {
  return value === REVIEW_FINDING_UNRATED
    ? translate('azureDevOpsReview.severityNone', 'No severity')
    : findingSeverityLabel(value)
}

function certaintyOptionLabel(value: ReviewFindingCertaintyFilterValue): string {
  return value === REVIEW_FINDING_UNRATED
    ? translate('azureDevOpsReview.draftsFilterNoCertainty', 'No certainty')
    : findingCertaintyLabel(value)
}

function fileOptionLabel(value: string | null): string {
  return value ?? translate('azureDevOpsReview.draftsFilterNoFile', 'No file')
}

/** One dimension of the filter: every value with how many drafts carry it. */
function FacetSubmenu<T>({
  label,
  facets,
  chosen,
  optionLabel,
  onChange
}: {
  label: string
  facets: [T, number][]
  chosen: readonly T[]
  optionLabel: (value: T) => string
  onChange: (chosen: T[]) => void
}): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{label}</span>
        {chosen.length > 0 ? <Badge variant="secondary">{chosen.length}</Badge> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 max-w-96">
        {facets.map(([value, count]) => (
          <DropdownMenuCheckboxItem
            key={JSON.stringify(value)}
            checked={chosen.includes(value)}
            onCheckedChange={() => onChange(toggled(chosen, value))}
            // Why: several values are usually picked in one go.
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">{optionLabel(value)}</span>
            <span className="text-muted-foreground tabular-nums">{count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Narrows the drafts list by severity, certainty, author and file. */
export function AzureDevOpsReviewDraftFilterMenu({
  filter,
  facets,
  onChange
}: {
  filter: ReviewFindingFilter
  facets: ReviewFindingFacets
  onChange: (filter: ReviewFindingFilter) => void
}): React.JSX.Element {
  const active = countReviewFindingFilters(filter)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="xs">
          <ListFilter className="size-3" />
          {translate('azureDevOpsReview.draftsFilter', 'Filter')}
          {active > 0 ? <Badge variant="secondary">{active}</Badge> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <FacetSubmenu
          label={translate('azureDevOpsReview.draftsFilterSeverity', 'Severity')}
          facets={facets.severities}
          chosen={filter.severities}
          optionLabel={severityOptionLabel}
          onChange={(severities) => onChange({ ...filter, severities })}
        />
        <FacetSubmenu
          label={translate('azureDevOpsReview.draftsFilterCertainty', 'Certainty')}
          facets={facets.certainties}
          chosen={filter.certainties}
          optionLabel={certaintyOptionLabel}
          onChange={(certainties) => onChange({ ...filter, certainties })}
        />
        <FacetSubmenu
          label={translate('azureDevOpsReview.draftsFilterAuthor', 'Author')}
          facets={facets.authorKeys}
          chosen={filter.authorKeys}
          optionLabel={azureDevOpsReviewDraftAuthorLabel}
          onChange={(authorKeys) => onChange({ ...filter, authorKeys })}
        />
        <FacetSubmenu
          label={translate('azureDevOpsReview.draftsFilterFile', 'File')}
          facets={facets.filePaths}
          chosen={filter.filePaths}
          optionLabel={fileOptionLabel}
          onChange={(filePaths) => onChange({ ...filter, filePaths })}
        />
        {active > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(EMPTY_REVIEW_FINDING_FILTER)}>
              {translate('azureDevOpsReview.draftsFilterClear', 'Clear filters')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
