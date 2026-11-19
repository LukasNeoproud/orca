import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { azureDevOpsReviewVoteLabel } from './azure-devops-review-vote-labels'

/** The line under the pull request title: where it comes from, its size and its state. */
export function AzureDevOpsPullRequestMeta({
  detail
}: {
  detail: AzureDevOpsReviewDetail
}): React.JSX.Element {
  const pr = detail.pullRequest
  return (
    <p className="truncate text-xs text-muted-foreground">
      {pr.project}/{pr.repository} · {pr.author.displayName} ·{' '}
      <span className="font-mono">{pr.sourceBranch}</span> →{' '}
      <span className="font-mono">{pr.targetBranch}</span>
      {` · ${translate('azureDevOpsReview.changedFilesMeta', 'Changed files: {{value0}}', {
        value0: detail.changes.length
      })}`}
      {pr.isDraft ? ` · ${translate('azureDevOpsReview.draftPr', 'Draft pull request')}` : ''}
      {pr.status !== 'active' ? ` · ${pr.status}` : ''}
      {pr.myVote !== 'none'
        ? ` · ${translate('azureDevOpsReview.myVote', 'Your vote: {{value0}}', {
            value0: azureDevOpsReviewVoteLabel(pr.myVote)
          })}`
        : ''}
    </p>
  )
}
