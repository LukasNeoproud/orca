import { Check, CircleDashed, Clock, MessageSquareDashed, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewVote
} from '../../../../shared/azure-devops-review-types'
import {
  reviewRowAction,
  type ReviewRowAction
} from '../../../../shared/azure-devops-review-groups'

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

const ROW_ACTION_LABELS: Record<ReviewRowAction, () => string> = {
  'start-review': () => translate('azureDevOpsReview.startReview', 'Start review'),
  'continue-review': () => translate('azureDevOpsReview.continueReview', 'Continue review')
}

export function AzureDevOpsPullRequestRow({
  pullRequest,
  draftCount,
  isNew,
  showOrganization,
  selected,
  onOpen
}: {
  pullRequest: AzureDevOpsReviewPullRequest
  draftCount: number
  /** A review request that arrived since the last look and has not been opened yet. */
  isNew: boolean
  showOrganization: boolean
  selected: boolean
  onOpen: () => void
}): React.JSX.Element {
  const repoLabel = showOrganization
    ? `${pullRequest.organizationLabel}/${pullRequest.repository}`
    : pullRequest.repository
  const action = reviewRowAction(pullRequest, draftCount)
  return (
    <div
      data-current={selected ? 'true' : undefined}
      data-new={isNew ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-1 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'page' : undefined}
        className="flex w-full flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {pullRequest.isDraft ? (
            <CircleDashed
              className="size-3 shrink-0 text-muted-foreground"
              aria-label={translate('azureDevOpsReview.draftPr', 'Draft pull request')}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{pullRequest.title}</span>
          {isNew ? <Badge>{translate('azureDevOpsReview.newRequest', 'New')}</Badge> : null}
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
      {action ? (
        <Button
          // Why: the request that just arrived is the one affirmative action in the list.
          variant={isNew ? 'default' : 'outline'}
          size="xs"
          className="self-start"
          onClick={onOpen}
        >
          {ROW_ACTION_LABELS[action]()}
        </Button>
      ) : null}
    </div>
  )
}
