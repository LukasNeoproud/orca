import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewRepo } from '../../../../shared/azure-devops-review-types'

/** Says which repositories have older pull requests than the list shows, and loads them. */
export function AzureDevOpsPullRequestListTruncation({
  repos,
  truncatedRepoKeys,
  canLoadMore,
  loading,
  onLoadMore
}: {
  repos: readonly AzureDevOpsReviewRepo[]
  truncatedRepoKeys: readonly string[]
  canLoadMore: boolean
  loading: boolean
  onLoadMore: () => void
}): React.JSX.Element | null {
  if (truncatedRepoKeys.length === 0) {
    return null
  }
  const names = truncatedRepoKeys
    .map((key) => repos.find((repo) => repo.key === key)?.repository ?? key)
    .join(', ')
  return (
    <div
      role="status"
      data-review-list-truncated=""
      className="space-y-2 border-t border-sidebar-border px-3 py-3 text-xs text-muted-foreground"
    >
      <p>
        {canLoadMore
          ? translate(
              'azureDevOpsReview.listTruncated',
              'Only the newest pull requests of {{value0}} are listed.',
              { value0: names }
            )
          : translate(
              'azureDevOpsReview.listTruncatedAtLimit',
              'Only the newest pull requests of {{value0}} are listed. Open Azure DevOps to see older ones.',
              { value0: names }
            )}
      </p>
      {canLoadMore ? (
        <Button variant="outline" size="xs" disabled={loading} onClick={onLoadMore}>
          {translate('azureDevOpsReview.loadOlder', 'Load older pull requests')}
        </Button>
      ) : null}
    </div>
  )
}
