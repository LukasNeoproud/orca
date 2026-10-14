import { useState } from 'react'
import { Bot, Pencil, Sparkles, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { CommentMarkdownAsync } from '@/components/sidebar/comment-markdown-lazy'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  deleteAzureDevOpsReviewDraft,
  updateAzureDevOpsReviewDraft
} from '@/lib/azure-devops-review-client'
import type { AzureDevOpsReviewDraftView } from '../../../../shared/azure-devops-review-types'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'
import { draftLocationLabel, threadStatusLabel } from './azure-devops-review-labels'
import { AzureDevOpsDraftAiPrompt } from './AzureDevOpsDraftAiPrompt'

export function AzureDevOpsReviewDraftCard({
  draft,
  selected,
  onSelectedChange,
  onChanged
}: {
  draft: AzureDevOpsReviewDraftView
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState(false)
  const aiPrompt = useAzureDevOpsReviewDraftPrompts((s) => s.prompts[draft.id]?.text ?? '')
  const published = draft.state === 'published'
  const selectable = !published && !draft.outdated

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await action()
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className={cn(
        'rounded-md border border-border',
        published && 'opacity-60',
        draft.outdated && 'border-dashed'
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <Checkbox
          checked={selected}
          disabled={!selectable || busy}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={translate('azureDevOpsReview.selectDraft', 'Select draft for publishing')}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
          {draftLocationLabel(draft)}
        </span>
        {draft.kind === 'reply' && draft.threadStatus ? (
          <span className="shrink-0 text-muted-foreground">
            → {threadStatusLabel(draft.threadStatus)}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {draft.author.kind === 'agent' ? <Bot className="size-3" /> : <User className="size-3" />}
          {draft.author.kind === 'agent'
            ? (draft.author.label ?? translate('azureDevOpsReview.agentAuthor', 'Agent'))
            : translate('azureDevOpsReview.youAuthor', 'You')}
        </span>
        {published ? (
          <span className="shrink-0 text-status-success">
            {translate('azureDevOpsReview.published', 'Published')}
          </span>
        ) : null}
        {draft.outdated ? (
          <span className="shrink-0 text-muted-foreground">
            {translate('azureDevOpsReview.outdated', 'Outdated')}
          </span>
        ) : null}
        {!published && !editing ? (
          <>
            <AzureDevOpsDraftAiPrompt
              draftId={draft.id}
              pullRequestKey={draft.pullRequestKey}
              variant="button"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={translate('azureDevOpsReview.editDraft', 'Edit draft')}
              onClick={() => {
                setBody(draft.body)
                setEditing(true)
              }}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={translate('azureDevOpsReview.deleteDraft', 'Delete draft')}
              onClick={() => void run(() => deleteAzureDevOpsReviewDraft(draft.id))}
            >
              <Trash2 className="size-3" />
            </Button>
          </>
        ) : null}
      </div>
      <div className="space-y-2 px-3 py-2">
        {editing ? (
          <>
            <Textarea
              autoFocus
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-20 text-sm"
              aria-label={translate('azureDevOpsReview.draftBody', 'Draft comment')}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => setEditing(false)}>
                {translate('azureDevOpsReview.cancel', 'Cancel')}
              </Button>
              <Button
                size="xs"
                disabled={busy || !body.trim()}
                onClick={() =>
                  void run(async () => {
                    await updateAzureDevOpsReviewDraft(draft.id, { body })
                    setEditing(false)
                  })
                }
              >
                {translate('azureDevOpsReview.saveDraft', 'Save draft')}
              </Button>
            </div>
          </>
        ) : (
          <CommentMarkdownAsync content={draft.body} className="text-sm" />
        )}
        {aiPrompt && !published ? (
          <p className="flex items-start gap-1.5 rounded-sm bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 whitespace-pre-wrap">{aiPrompt}</span>
          </p>
        ) : null}
        {draft.outdated && !published ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex-1">
              {translate(
                'azureDevOpsReview.outdatedHint',
                'Written against an older iteration; the lines may have moved.'
              )}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() =>
                void run(() => updateAzureDevOpsReviewDraft(draft.id, { rebaseToLatest: true }))
              }
            >
              {translate('azureDevOpsReview.keepForLatest', 'Keep for latest iteration')}
            </Button>
          </div>
        ) : null}
        {draft.state === 'failed' && draft.publishError ? (
          <p role="alert" className="text-xs text-destructive">
            {draft.publishError}
          </p>
        ) : null}
      </div>
    </li>
  )
}
