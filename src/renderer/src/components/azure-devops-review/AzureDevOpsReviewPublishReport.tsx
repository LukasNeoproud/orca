import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewCastableVote } from '../../../../shared/azure-devops-review-vote'
import type {
  AzureDevOpsReviewPublishFailure,
  AzureDevOpsReviewPublishOutcome
} from './azure-devops-review-publish-outcome'
import { azureDevOpsReviewVoteLabel } from './azure-devops-review-vote-labels'

function voteLine(
  outcome: AzureDevOpsReviewPublishOutcome,
  vote: AzureDevOpsReviewCastableVote | null
): string | null {
  switch (outcome.vote) {
    case 'not-requested':
      return null
    case 'sent':
      return translate('azureDevOpsReview.voteDone', 'Your vote is set to {{value1}}.', {
        value1: vote ? azureDevOpsReviewVoteLabel(vote) : ''
      })
    case 'skipped':
      return translate(
        'azureDevOpsReview.voteSkipped',
        'Your vote was not sent, because a comment was not posted. To vote, publish again and choose the vote again.'
      )
    case 'failed':
      return translate('azureDevOpsReview.voteFailed', 'Your vote was not sent: {{value0}}', {
        value0: outcome.voteError ?? ''
      })
    case 'unacknowledged':
      return translate(
        'azureDevOpsReview.voteUnsupported',
        'Your vote was not sent: the Orca host that holds the Azure DevOps sign-in cannot cast votes yet. Update it, or vote in Azure DevOps.'
      )
  }
}

/** What reached Azure DevOps and what did not, kept on screen until the user closes it. */
export function AzureDevOpsReviewPublishReport({
  failure,
  vote,
  onClose
}: {
  failure: AzureDevOpsReviewPublishFailure
  vote: AzureDevOpsReviewCastableVote | null
  onClose: () => void
}): React.JSX.Element {
  const outcome = failure.kind === 'incomplete' ? failure.outcome : null
  const voteText = outcome ? voteLine(outcome, vote) : null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {outcome
              ? translate('azureDevOpsReview.publishIncompleteTitle', 'Not everything was sent')
              : translate('azureDevOpsReview.publishErrorTitle', 'Publishing failed')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'azureDevOpsReview.publishIncompleteDescription',
              'Nothing is sent again on its own.'
            )}
          </DialogDescription>
        </DialogHeader>
        {failure.kind === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {failure.message}
          </p>
        ) : null}
        {outcome ? (
          <ul className="list-disc space-y-1 pl-5 text-sm" role="alert">
            {outcome.commentsPosted > 0 ? (
              <li>
                {translate('azureDevOpsReview.publishReportPosted', 'Comments posted: {{value0}}', {
                  value0: outcome.commentsPosted
                })}
              </li>
            ) : null}
            {outcome.commentsFailed > 0 ? (
              <li>
                {translate(
                  'azureDevOpsReview.publishReportFailed',
                  'Comments not posted: {{value0}}. They stay in Drafts with the reason.',
                  { value0: outcome.commentsFailed }
                )}
              </li>
            ) : null}
            {voteText ? <li>{voteText}</li> : null}
          </ul>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>{translate('azureDevOpsReview.closeReport', 'Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
