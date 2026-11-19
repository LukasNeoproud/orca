import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { translate } from '@/i18n/i18n'
import { publishAzureDevOpsReviewDrafts } from '@/lib/azure-devops-review-client'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import type { AzureDevOpsReviewPullRequest } from '../../../../shared/azure-devops-review-types'
import {
  AZURE_DEVOPS_REVIEW_CASTABLE_VOTES,
  isAzureDevOpsReviewCastableVote,
  type AzureDevOpsReviewCastableVote
} from '../../../../shared/azure-devops-review-vote'
import {
  summarizeAzureDevOpsReviewPublish,
  type AzureDevOpsReviewPublishFailure,
  type AzureDevOpsReviewPublishOutcome
} from './azure-devops-review-publish-outcome'
import {
  azureDevOpsReviewVoteActionLabel,
  azureDevOpsReviewVoteLabel
} from './azure-devops-review-vote-labels'
import { AzureDevOpsReviewPublishReport } from './AzureDevOpsReviewPublishReport'

const KEEP_VOTE = 'keep'
type VoteChoice = AzureDevOpsReviewCastableVote | typeof KEEP_VOTE

function successMessage(
  outcome: AzureDevOpsReviewPublishOutcome,
  vote: AzureDevOpsReviewCastableVote | null
): string {
  if (!vote) {
    return translate('azureDevOpsReview.publishDone', 'Published {{value0}} comments.', {
      value0: outcome.commentsPosted
    })
  }
  const value1 = azureDevOpsReviewVoteLabel(vote)
  return outcome.commentsPosted > 0
    ? translate(
        'azureDevOpsReview.publishDoneWithVote',
        'Published {{value0}} comments and set your vote to {{value1}}.',
        { value0: outcome.commentsPosted, value1 }
      )
    : translate('azureDevOpsReview.voteDone', 'Your vote is set to {{value1}}.', { value1 })
}

/**
 * The one place a review leaves Orca: it names what is sent, sends it once after the user
 * confirms, and keeps an incomplete result on screen. A vote is never carried over to a later
 * attempt; the dialog has to be opened and the vote chosen again.
 */
export function AzureDevOpsReviewPublishDialog({
  pullRequest,
  draftIds,
  voteOffered,
  onClose,
  onPublished
}: {
  pullRequest: Pick<AzureDevOpsReviewPullRequest, 'key' | 'myVote'>
  draftIds: string[]
  /** False on an own or closed pull request and against a host that cannot cast votes. */
  voteOffered: boolean
  onClose: () => void
  /** Runs after every attempt, complete or not, so the page shows what Azure DevOps has now. */
  onPublished: () => Promise<void>
}): React.JSX.Element {
  // Why a snapshot: what the dialog named when it opened is what gets sent.
  const [ids] = useState(draftIds)
  const [choice, setChoice] = useState<VoteChoice>(KEEP_VOTE)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{
    failure: AzureDevOpsReviewPublishFailure
    vote: AzureDevOpsReviewCastableVote | null
  } | null>(null)
  // Why a ref and never reset: one dialog sends at most once, however fast the clicks come.
  const sent = useRef(false)
  const vote = voteOffered && choice !== KEEP_VOTE ? choice : null
  const nothingToSend = ids.length === 0 && vote === null
  const currentVote = azureDevOpsReviewVoteLabel(pullRequest.myVote)

  const publish = async (): Promise<void> => {
    if (sent.current || nothingToSend) {
      return
    }
    sent.current = true
    setBusy(true)
    try {
      const outcome = summarizeAzureDevOpsReviewPublish(
        await publishAzureDevOpsReviewDrafts(pullRequest.key, ids, vote),
        vote
      )
      const store = useAzureDevOpsReviewStore.getState()
      if (outcome.vote === 'sent' && store.list) {
        // Why: the vote moves the pull request between the list's groups.
        void store.refresh()
      }
      if (outcome.complete) {
        toast.success(successMessage(outcome, vote))
        onClose()
      } else {
        setReport({ failure: { kind: 'incomplete', outcome }, vote })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setReport({ failure: { kind: 'error', message }, vote })
    } finally {
      setBusy(false)
      await onPublished()
    }
  }

  if (report) {
    return (
      <AzureDevOpsReviewPublishReport
        failure={report.failure}
        vote={report.vote}
        onClose={onClose}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('azureDevOpsReview.publishDialogTitle', 'Publish to Azure DevOps')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'azureDevOpsReview.publishDialogDescription',
              'What is listed below is sent to Azure DevOps as you, and reviewers get notified.'
            )}
          </DialogDescription>
        </DialogHeader>
        {voteOffered ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="ado-publish-vote">
                {translate('azureDevOpsReview.voteLabel', 'Your vote')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate('azureDevOpsReview.voteCurrent', 'Your vote now: {{value0}}', {
                  value0: currentVote
                })}
              </p>
            </div>
            <Select
              value={choice}
              disabled={busy}
              onValueChange={(value) => {
                if (value === KEEP_VOTE || isAzureDevOpsReviewCastableVote(value)) {
                  setChoice(value)
                }
              }}
            >
              <SelectTrigger id="ado-publish-vote" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP_VOTE}>
                  {translate('azureDevOpsReview.voteKeep', 'Leave my vote unchanged')}
                </SelectItem>
                {AZURE_DEVOPS_REVIEW_CASTABLE_VOTES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {azureDevOpsReviewVoteActionLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <ul
          className="list-disc space-y-1 pl-5 text-sm"
          aria-label={translate('azureDevOpsReview.publishSummary', 'What is sent')}
        >
          <li>
            {ids.length > 0
              ? translate(
                  'azureDevOpsReview.publishSummaryComments',
                  'Comments to post: {{value0}}',
                  {
                    value0: ids.length
                  }
                )
              : translate(
                  'azureDevOpsReview.publishSummaryNoComments',
                  'No comment is posted: no draft is selected.'
                )}
          </li>
          {voteOffered ? (
            <li>
              {vote
                ? translate(
                    'azureDevOpsReview.publishSummaryVote',
                    'Your vote changes from {{value0}} to {{value1}}.',
                    { value0: currentVote, value1: azureDevOpsReviewVoteLabel(vote) }
                  )
                : translate('azureDevOpsReview.publishSummaryNoVote', 'Your vote is not changed.')}
            </li>
          ) : null}
          {vote && ids.length > 0 ? (
            <li className="text-muted-foreground">
              {translate(
                'azureDevOpsReview.publishSummaryOrder',
                'The vote is sent after the comments, and only when every comment was posted.'
              )}
            </li>
          ) : null}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {translate('azureDevOpsReview.cancel', 'Cancel')}
          </Button>
          <Button disabled={busy || nothingToSend} onClick={() => void publish()}>
            {busy ? <LoadingSpinner className="size-3.5" /> : <Send className="size-3.5" />}
            {translate('azureDevOpsReview.publish', 'Publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
