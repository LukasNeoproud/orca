import { Check, CircleDashed, Clock, MessageSquareDashed, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewVote
} from '../../../../shared/azure-devops-review-types'

function VoteIcon({ vote }: { vote: AzureDevOpsReviewVote }): React.JSX.Element | null {
  switch (vote) {
    case 'approved':
    case 'approved-with-suggestions':
      return (
        <Check
          className="size-3 shrink-0 text-status-success"
          aria-label={translate('azureDevOpsReview.voteApproved', 'You approved')}
        />
      )
    case 'waiting-for-author':
      return (
        <Clock
          className="size-3 shrink-0 text-muted-foreground"
          aria-label={translate('azureDevOpsReview.voteWaiting', 'You are waiting for the author')}
        />
      )
    case 'rejected':
      return (
        <X
          className="size-3 shrink-0 text-destructive"
          aria-label={translate('azureDevOpsReview.voteRejected', 'You rejected')}
        />
      )
    case 'none':
      return null
  }
}

export function AzureDevOpsPullRequestRow({
  pullRequest,
  draftCount,
  showOrganization,
  selected,
  onOpen
}: {
  pullRequest: AzureDevOpsReviewPullRequest
  draftCount: number
  showOrganization: boolean
  selected: boolean
  onOpen: () => void
}): React.JSX.Element {
  const repoLabel = showOrganization
    ? `${pullRequest.organizationLabel}/${pullRequest.repository}`
    : pullRequest.repository
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {pullRequest.isDraft ? (
          <CircleDashed
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={translate('azureDevOpsReview.draftPr', 'Draft pull request')}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{pullRequest.title}</span>
        <VoteIcon vote={pullRequest.myVote} />
        {draftCount > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground"
            title={translate(
              'azureDevOpsReview.unpublishedDrafts',
              '{{value0}} unpublished drafts',
              {
                value0: draftCount
              }
            )}
          >
            <MessageSquareDashed className="size-3" />
            {draftCount}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {repoLabel} · !{pullRequest.pullRequestId} · {pullRequest.author.displayName}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatUiRelativeTimeFromDate(pullRequest.createdAt)}
        </span>
      </span>
    </button>
  )
}
