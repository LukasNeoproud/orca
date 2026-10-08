import { useState } from 'react'
import { Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommentMarkdownAsync } from '@/components/sidebar/comment-markdown-lazy'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { cn } from '@/lib/utils'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewThread
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsDraftComposer } from './AzureDevOpsDraftComposer'
import { threadStatusLabel } from './azure-devops-review-labels'

function threadLocation(thread: AzureDevOpsReviewThread): string | null {
  if (!thread.filePath) {
    return null
  }
  if (!thread.anchor) {
    return thread.filePath
  }
  const { startLine, endLine } = thread.anchor
  return `${thread.filePath}:${startLine === endLine ? startLine : `${startLine}–${endLine}`}`
}

export function AzureDevOpsReviewThreads({
  detail,
  onChanged
}: {
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const pendingReplies = new Set(
    detail.drafts
      .filter((draft) => draft.kind === 'reply' && draft.state !== 'published')
      .map((draft) => draft.threadId)
  )
  if (detail.threads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate('azureDevOpsReview.noThreads', 'No comment threads yet.')}
      </p>
    )
  }
  // Why: open threads need attention first; resolved ones follow.
  const threads = [...detail.threads].sort(
    (a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.id - b.id
  )
  return (
    <ul className="space-y-3">
      {threads.map((thread) => {
        const location = threadLocation(thread)
        return (
          <li key={thread.id} className="rounded-md border border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[11px]',
                  thread.status === 'active'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {threadStatusLabel(thread.status)}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                {location ?? translate('azureDevOpsReview.generalComment', 'General comment')}
              </span>
              {pendingReplies.has(thread.id) ? (
                <span className="shrink-0 text-muted-foreground">
                  {translate('azureDevOpsReview.replyDrafted', 'Reply drafted')}
                </span>
              ) : null}
              <Button variant="ghost" size="xs" onClick={() => setReplyTo(thread.id)}>
                <Reply className="size-3" />
                {translate('azureDevOpsReview.reply', 'Reply')}
              </Button>
            </div>
            <div className="space-y-3 px-3 py-2">
              {thread.comments
                .filter((comment) => !comment.isSystem)
                .map((comment) => (
                  <div key={comment.id} className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.author.displayName}
                      </span>
                      {comment.publishedAt
                        ? ` · ${formatUiRelativeTimeFromDate(comment.publishedAt)}`
                        : ''}
                    </p>
                    <CommentMarkdownAsync content={comment.content} className="text-sm" />
                  </div>
                ))}
              {replyTo === thread.id ? (
                <AzureDevOpsDraftComposer
                  pullRequestKey={detail.pullRequest.key}
                  kind="reply"
                  threadId={thread.id}
                  onDone={() => {
                    setReplyTo(null)
                    void onChanged()
                  }}
                  onCancel={() => setReplyTo(null)}
                />
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
