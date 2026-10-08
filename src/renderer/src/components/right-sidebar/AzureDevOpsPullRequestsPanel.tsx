import { useEffect, useMemo } from 'react'
import { RefreshCw, Search, Settings2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
  filterAzureDevOpsReviewPullRequests,
  isDefaultAzureDevOpsReviewFilters
} from '../../../../shared/azure-devops-review-filters'
import { AzureDevOpsPullRequestFilters } from './AzureDevOpsPullRequestFilters'
import { AzureDevOpsPullRequestRow } from './AzureDevOpsPullRequestRow'
import { openAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'

const REFRESH_INTERVAL_MS = 3 * 60_000

export default function AzureDevOpsPullRequestsPanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const filters = useAzureDevOpsReviewStore((s) => s.filters)
  const list = useAzureDevOpsReviewStore((s) => s.list)
  const loading = useAzureDevOpsReviewStore((s) => s.loading)
  const error = useAzureDevOpsReviewStore((s) => s.error)
  const openKey = useAzureDevOpsReviewStore((s) => s.openPullRequestKey)
  const setFilters = useAzureDevOpsReviewStore((s) => s.setFilters)
  const refresh = useAzureDevOpsReviewStore((s) => s.refresh)

  useEffect(() => {
    if (!isVisible) {
      return
    }
    const fetchedAt = useAzureDevOpsReviewStore.getState().list?.fetchedAt ?? 0
    if (Date.now() - fetchedAt > REFRESH_INTERVAL_MS) {
      void refresh()
    }
    // Why: poll only while the panel is on screen; ADO throttles chatty clients.
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isVisible, refresh])

  const pullRequests = useMemo(
    () => filterAzureDevOpsReviewPullRequests(list?.pullRequests ?? [], filters),
    [list, filters]
  )
  const openSettings = (): void => {
    const store = useAppStore.getState()
    store.openSettingsTarget({ pane: 'integrations', repoId: null })
    store.openSettingsPage()
  }

  const showOrganization = useMemo(
    () => new Set(list?.repos.map((repo) => repo.organizationKey)).size > 1,
    [list]
  )
  const total = list?.pullRequests.length ?? 0
  const noRepos = list !== null && list.repos.length === 0

  return (
    <section
      className="flex min-h-0 flex-1 flex-col text-sidebar-foreground"
      aria-label={translate('azureDevOpsReview.title', 'Pull requests')}
    >
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {translate('azureDevOpsReview.title', 'Pull requests')}
        </span>
        {list && total > 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {translate('azureDevOpsReview.count', '{{value0}} of {{value1}}', {
              value0: pullRequests.length,
              value1: total
            })}
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('azureDevOpsReview.refresh', 'Refresh pull requests')}
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('azureDevOpsReview.refresh', 'Refresh pull requests')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('azureDevOpsReview.connections', 'Azure DevOps connections')}
              onClick={openSettings}
            >
              <Settings2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('azureDevOpsReview.connections', 'Azure DevOps connections')}
          </TooltipContent>
        </Tooltip>
      </div>
      {noRepos ? null : (
        <div className="space-y-2 border-b border-sidebar-border px-3 py-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={translate('azureDevOpsReview.search', 'Search pull requests')}
              placeholder={translate(
                'azureDevOpsReview.searchPlaceholder',
                'Search ID, title or author'
              )}
              value={filters.query}
              onChange={(event) => setFilters({ query: event.target.value })}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <AzureDevOpsPullRequestFilters
            filters={filters}
            repos={list?.repos ?? []}
            onChange={setFilters}
          />
        </div>
      )}
      {error ? (
        <p
          role="alert"
          className="border-b border-sidebar-border px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
      {list?.errors.length ? (
        <div className="space-y-1 border-b border-sidebar-border px-3 py-2 text-[11px]">
          {list.errors.map((entry) => (
            <p key={`${entry.scope}:${entry.message}`} className="text-muted-foreground">
              <span className="font-medium text-foreground">{entry.scope}</span>: {entry.message}
            </p>
          ))}
          <Button variant="link" size="xs" className="h-auto px-0" onClick={openSettings}>
            {translate('azureDevOpsReview.openConnections', 'Manage connections')}
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {list === null ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {loading
              ? translate('azureDevOpsReview.loading', 'Loading pull requests…')
              : translate('azureDevOpsReview.notLoaded', 'Pull requests are not loaded yet.')}
          </p>
        ) : noRepos ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {translate(
              'azureDevOpsReview.noRepos',
              'Add a project whose origin is an Azure Repos repository to see its pull requests here.'
            )}
          </p>
        ) : pullRequests.length === 0 ? (
          <div className="space-y-2 px-3 py-4 text-xs text-muted-foreground">
            <p>
              {total === 0
                ? translate(
                    'azureDevOpsReview.empty',
                    'No pull requests are waiting for your review.'
                  )
                : translate('azureDevOpsReview.noMatches', 'No pull requests match the filters.')}
            </p>
            {!isDefaultAzureDevOpsReviewFilters(filters) ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setFilters(DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS)}
              >
                {translate('azureDevOpsReview.resetFilters', 'Reset filters')}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-px p-1">
            {pullRequests.map((pr) => (
              <li key={pr.key}>
                <AzureDevOpsPullRequestRow
                  pullRequest={pr}
                  draftCount={list.draftCounts[pr.key] ?? 0}
                  showOrganization={showOrganization}
                  selected={openKey === pr.key}
                  onOpen={() => openAzureDevOpsPullRequestPage(pr.key)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
