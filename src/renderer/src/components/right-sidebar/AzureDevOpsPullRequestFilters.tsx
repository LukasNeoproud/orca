import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  AZURE_DEVOPS_REVIEW_ALL,
  azureDevOpsReviewFilterOptions,
  type AzureDevOpsReviewFilters
} from '../../../../shared/azure-devops-review-filters'
import type {
  AzureDevOpsPullRequestStatusFilter,
  AzureDevOpsReviewRepo
} from '../../../../shared/azure-devops-review-types'

// Why: narrow sidebars wrap the selects onto two rows instead of truncating their labels.
const TRIGGER_CLASS = 'min-w-[7.5rem] flex-1 text-xs'

export function AzureDevOpsPullRequestFilters({
  filters,
  repos,
  onChange
}: {
  filters: AzureDevOpsReviewFilters
  repos: readonly AzureDevOpsReviewRepo[]
  onChange: (patch: Partial<AzureDevOpsReviewFilters>) => void
}): React.JSX.Element {
  const options = useMemo(
    () => azureDevOpsReviewFilterOptions(repos, filters.project),
    [repos, filters.project]
  )
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={filters.project}
        // Why: a repo outside the newly picked project would filter everything out.
        onValueChange={(project) => onChange({ project, repo: AZURE_DEVOPS_REVIEW_ALL })}
      >
        <SelectTrigger
          size="sm"
          aria-label={translate('azureDevOpsReview.filterProject', 'Filter by project')}
          className={TRIGGER_CLASS}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value={AZURE_DEVOPS_REVIEW_ALL}>
            {translate('azureDevOpsReview.allProjects', 'All projects')}
          </SelectItem>
          {options.projects.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.repo} onValueChange={(repo) => onChange({ repo })}>
        <SelectTrigger
          size="sm"
          aria-label={translate('azureDevOpsReview.filterRepo', 'Filter by repository')}
          className={TRIGGER_CLASS}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value={AZURE_DEVOPS_REVIEW_ALL}>
            {translate('azureDevOpsReview.allRepos', 'All repos')}
          </SelectItem>
          {options.repos.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.status}
        onValueChange={(status) =>
          onChange({ status: status as AzureDevOpsPullRequestStatusFilter })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={translate('azureDevOpsReview.filterStatus', 'Filter by status')}
          className={TRIGGER_CLASS}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="active">
            {translate('azureDevOpsReview.statusActive', 'Active')}
          </SelectItem>
          <SelectItem value="completed">
            {translate('azureDevOpsReview.statusCompleted', 'Completed')}
          </SelectItem>
          <SelectItem value="abandoned">
            {translate('azureDevOpsReview.statusAbandoned', 'Abandoned')}
          </SelectItem>
          <SelectItem value="all">
            {translate('azureDevOpsReview.statusAll', 'All states')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
