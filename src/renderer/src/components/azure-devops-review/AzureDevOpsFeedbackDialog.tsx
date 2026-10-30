import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { openAzureDevOpsFeedbackThreads } from '../../../../shared/azure-devops-feedback-prompt'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { threadLocationLabel } from './azure-devops-review-labels'

/** Picks the review threads on the user's own pull request that an agent should address. */
export function AzureDevOpsFeedbackDialog({
  detail,
  onCancel,
  onStart
}: {
  detail: AzureDevOpsReviewDetail
  onCancel: () => void
  onStart: (threadIds: number[], instruction: string) => void
}): React.JSX.Element {
  const [offered] = useState(() => openAzureDevOpsFeedbackThreads(detail.threads))
  // Why unchecked when drafted: a thread with an unpublished reply was already answered.
  const [included, setIncluded] = useState(() => {
    const drafted = new Set(
      detail.drafts
        .filter((draft) => draft.kind === 'reply' && draft.state !== 'published')
        .map((draft) => draft.threadId)
    )
    return new Set(offered.filter((thread) => !drafted.has(thread.id)).map((thread) => thread.id))
  })
  const [instruction, setInstruction] = useState('')
  const chosen = offered.filter((thread) => included.has(thread.id)).map((thread) => thread.id)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('azureDevOpsReview.feedbackTitle', 'Address review feedback')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'azureDevOpsReview.feedbackDescription',
              'Your default agent works in the workspace with the branch {{value0}}. It judges each thread, fixes what holds and writes a reply draft with a proposed thread status. Nothing is committed, pushed or published.',
              { value0: detail.pullRequest.sourceBranch }
            )}
          </DialogDescription>
        </DialogHeader>
        {offered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate('azureDevOpsReview.feedbackEmpty', 'No open threads wait for you.')}
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-sleek">
            {offered.map((thread) => {
              const first = thread.comments.find((comment) => !comment.isSystem)
              return (
                <li
                  key={thread.id}
                  className="flex items-start gap-2 rounded-md border border-border p-2"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={included.has(thread.id)}
                    aria-label={translate('azureDevOpsReview.feedbackInclude', 'Address thread')}
                    onCheckedChange={(checked) =>
                      setIncluded((current) => {
                        const next = new Set(current)
                        if (checked === true) {
                          next.add(thread.id)
                        } else {
                          next.delete(thread.id)
                        }
                        return next
                      })
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {threadLocationLabel(thread) ??
                        translate('azureDevOpsReview.generalComment', 'General comment')}
                    </p>
                    {first ? (
                      <p className="line-clamp-2 text-xs" title={first.content}>
                        <span className="font-medium">{first.author.displayName}:</span>{' '}
                        {first.content}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="space-y-2">
          <Label htmlFor="ado-feedback-instruction">
            {translate('azureDevOpsReview.feedbackInstruction', 'Instructions for the agent')}
          </Label>
          <Textarea
            id="ado-feedback-instruction"
            value={instruction}
            placeholder={translate(
              'azureDevOpsReview.feedbackInstructionPlaceholder',
              'Optional. For example: keep the public API unchanged; run the unit tests of the touched projects.'
            )}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('azureDevOpsReview.cancel', 'Cancel')}
          </Button>
          <Button disabled={chosen.length === 0} onClick={() => onStart(chosen, instruction)}>
            <Bot className="size-3.5" />
            {translate('azureDevOpsReview.feedbackStart', 'Address {{value0}} threads', {
              value0: chosen.length
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
