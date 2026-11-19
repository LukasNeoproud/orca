import { useMemo, useState } from 'react'
import { MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewDraftCard } from './AzureDevOpsReviewDraftCard'
import type { AzureDevOpsReviewOpenInDiff } from './AzureDevOpsReviewDraftEvidence'
import { AzureDevOpsDraftComposer } from './AzureDevOpsDraftComposer'
import { AzureDevOpsReviewPublishDialog } from './AzureDevOpsReviewPublishDialog'
import { useAzureDevOpsReviewFindingsKept } from './use-azure-devops-review-findings-kept'
import { useAzureDevOpsReviewVoteOffered } from './use-azure-devops-review-vote-offered'

export function AzureDevOpsReviewDrafts({
  detail,
  onChanged,
  onAskAi,
  onOpenInDiff
}: {
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
  /** Opens the send-to-AI dialog with these drafts picked. */
  onAskAi: (draftIds: string[]) => void
  /** Shows a line of a changed file in the Files tab. */
  onOpenInDiff: (filePath: string, line: number) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [composing, setComposing] = useState(false)
  const voteOffered = useAzureDevOpsReviewVoteOffered(detail.pullRequest)
  const severityEditable = useAzureDevOpsReviewFindingsKept()
  const { pending, published } = useMemo(
    () => ({
      pending: detail.drafts.filter((draft) => draft.state !== 'published'),
      published: detail.drafts.filter((draft) => draft.state === 'published')
    }),
    [detail.drafts]
  )
  const openInDiff = useMemo<AzureDevOpsReviewOpenInDiff>(() => {
    const changed = new Set(detail.changes.map((change) => change.path))
    return { canOpen: (filePath) => changed.has(filePath), open: onOpenInDiff }
  }, [detail.changes, onOpenInDiff])
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

  // Why nothing is sent from here: the dialog names what leaves and the user confirms it there.
  const publishDialog = publishing ? (
    <AzureDevOpsReviewPublishDialog
      pullRequest={detail.pullRequest}
      draftIds={selectedIds}
      voteOffered={voteOffered}
      onClose={() => setPublishing(false)}
      onPublished={async () => {
        setSelected(new Set())
        await onChanged()
      }}
    />
  ) : null
  const publishButton =
    selectedIds.length > 0 || !voteOffered ? (
      <Button size="sm" disabled={selectedIds.length === 0} onClick={() => setPublishing(true)}>
        <Send className="size-3.5" />
        {translate('azureDevOpsReview.publishSelected', 'Publish selected ({{value0}})', {
          value0: selectedIds.length
        })}
      </Button>
    ) : (
      <Button size="sm" onClick={() => setPublishing(true)}>
        <Send className="size-3.5" />
        {translate('azureDevOpsReview.voteOnly', 'Vote')}
      </Button>
    )

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
          {voteOffered ? publishButton : null}
        </div>
        {generalComposer}
        {publishDialog}
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
        {publishButton}
      </div>
      {generalComposer}
      {publishDialog}
      <ul className="space-y-3">
        {pending.map((draft) => (
          <AzureDevOpsReviewDraftCard
            key={draft.id}
            draft={draft}
            selected={selected.has(draft.id) && !draft.outdated}
            onSelectedChange={(value) => setDraftSelected(draft.id, value)}
            onChanged={onChanged}
            openInDiff={openInDiff}
            severityEditable={severityEditable}
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
                openInDiff={openInDiff}
                severityEditable={false}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
