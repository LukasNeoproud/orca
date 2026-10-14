import { useMemo, useState } from 'react'
import { MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { publishAzureDevOpsReviewDrafts } from '@/lib/azure-devops-review-client'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewDraftCard } from './AzureDevOpsReviewDraftCard'
import { AzureDevOpsDraftComposer } from './AzureDevOpsDraftComposer'

export function AzureDevOpsReviewDrafts({
  detail,
  onChanged,
  onAskAi
}: {
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
  /** Opens the send-to-AI dialog with these drafts picked. */
  onAskAi: (draftIds: string[]) => void
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [composing, setComposing] = useState(false)
  const { pending, published } = useMemo(
    () => ({
      pending: detail.drafts.filter((draft) => draft.state !== 'published'),
      published: detail.drafts.filter((draft) => draft.state === 'published')
    }),
    [detail.drafts]
  )
  const publishable = pending.filter((draft) => !draft.outdated)
  // Why: drafts can disappear or turn outdated after a reload; never publish a stale selection.
  const selectedIds = publishable.filter((draft) => selected.has(draft.id)).map((d) => d.id)

  const setDraftSelected = (id: string, value: boolean): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (value) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const publish = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      return
    }
    const ok = await confirm({
      title: translate('azureDevOpsReview.publishTitle', 'Publish {{value0}} comments?', {
        value0: selectedIds.length
      }),
      description: translate(
        'azureDevOpsReview.publishDescription',
        'The selected drafts are posted to Azure DevOps as you, and reviewers get notified.'
      ),
      confirmLabel: translate('azureDevOpsReview.publish', 'Publish')
    })
    if (!ok) {
      return
    }
    setPublishing(true)
    try {
      const { results } = await publishAzureDevOpsReviewDrafts(detail.pullRequest.key, selectedIds)
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        toast.error(
          translate('azureDevOpsReview.publishFailed', '{{value0}} drafts were not published.', {
            value0: failed.length
          })
        )
      } else {
        toast.success(
          translate('azureDevOpsReview.publishDone', 'Published {{value0}} comments.', {
            value0: results.length
          })
        )
      }
      setSelected(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishing(false)
      await onChanged()
    }
  }

  const generalComposer = composing ? (
    <AzureDevOpsDraftComposer
      pullRequestKey={detail.pullRequest.key}
      kind="general"
      onCancel={() => setComposing(false)}
      onDone={() => {
        setComposing(false)
        void onChanged()
      }}
    />
  ) : null
  const generalButton = (
    <Button variant="outline" size="xs" onClick={() => setComposing(true)} disabled={composing}>
      <MessageSquarePlus className="size-3" />
      {translate('azureDevOpsReview.addGeneral', 'General comment')}
    </Button>
  )

  if (detail.drafts.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            {translate(
              'azureDevOpsReview.noDrafts',
              'No drafts yet. Comment lines in Files, reply in Threads, or let an agent review the pull request.'
            )}
          </p>
          {generalButton}
        </div>
        {generalComposer}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          disabled={publishable.length === 0}
          onClick={() =>
            setSelected(
              selectedIds.length === publishable.length
                ? new Set()
                : new Set(publishable.map((draft) => draft.id))
            )
          }
        >
          {selectedIds.length === publishable.length && publishable.length > 0
            ? translate('azureDevOpsReview.selectNone', 'Select none')
            : translate('azureDevOpsReview.selectAll', 'Select all')}
        </Button>
        {generalButton}
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={pending.length === 0}
          onClick={() =>
            onAskAi(pending.filter((draft) => selected.has(draft.id)).map((draft) => draft.id))
          }
        >
          <Sparkles className="size-3.5" />
          {translate('azureDevOpsReview.askAi', 'Ask AI')}
        </Button>
        <Button
          size="sm"
          disabled={publishing || selectedIds.length === 0}
          onClick={() => void publish()}
        >
          <Send className="size-3.5" />
          {translate('azureDevOpsReview.publishSelected', 'Publish selected ({{value0}})', {
            value0: selectedIds.length
          })}
        </Button>
      </div>
      {generalComposer}
      <ul className="space-y-3">
        {pending.map((draft) => (
          <AzureDevOpsReviewDraftCard
            key={draft.id}
            draft={draft}
            selected={selected.has(draft.id) && !draft.outdated}
            onSelectedChange={(value) => setDraftSelected(draft.id, value)}
            onChanged={onChanged}
          />
        ))}
      </ul>
      {published.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {translate('azureDevOpsReview.publishedCount', 'Published ({{value0}})', {
              value0: published.length
            })}
          </summary>
          <ul className="mt-2 space-y-3">
            {published.map((draft) => (
              <AzureDevOpsReviewDraftCard
                key={draft.id}
                draft={draft}
                selected={false}
                onSelectedChange={() => undefined}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
