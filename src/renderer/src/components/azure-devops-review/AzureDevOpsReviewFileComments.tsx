import { useState } from 'react'
import { ChevronDown, MessageSquare, MessageSquareDashed } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  AzureDevOpsLineAnchor,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { threadStatusLabel } from './azure-devops-review-labels'

type FileComment = {
  key: string
  draft: boolean
  anchor: AzureDevOpsLineAnchor | null
  author: string
  text: string
  status: string | null
}

function lineLabel(anchor: AzureDevOpsLineAnchor | null): string {
  if (!anchor) {
    return translate('azureDevOpsReview.wholeFile', 'File')
  }
  const range =
    anchor.startLine === anchor.endLine
      ? `${anchor.startLine}`
      : `${anchor.startLine}–${anchor.endLine}`
  return anchor.side === 'left' ? `L${range} (old)` : `L${range}`
}

/** Existing threads and unpublished drafts on one file, ordered by line like the diff. */
export function AzureDevOpsReviewFileComments({
  detail,
  path
}: {
  detail: AzureDevOpsReviewDetail
  path: string
}): React.JSX.Element | null {
  // Why collapsed: the diff already shows new-side threads and drafts under their lines.
  const [open, setOpen] = useState(false)
  const comments: FileComment[] = [
    ...detail.threads
      .filter((thread) => thread.filePath === path)
      .map((thread) => {
        const first = thread.comments.find((comment) => !comment.isSystem)
        return {
          key: `t${thread.id}`,
          draft: false,
          anchor: thread.anchor,
          author: first?.author.displayName ?? '',
          text: first?.content ?? '',
          status: threadStatusLabel(thread.status)
        }
      }),
    ...detail.drafts
      .filter((draft) => draft.filePath === path && draft.state !== 'published')
      .map((draft) => ({
        key: `d${draft.id}`,
        draft: true,
        anchor: draft.anchor,
        author:
          draft.author.kind === 'agent'
            ? (draft.author.label ?? translate('azureDevOpsReview.agentAuthor', 'Agent'))
            : translate('azureDevOpsReview.youAuthor', 'You'),
        text: draft.body,
        status: draft.outdated ? translate('azureDevOpsReview.outdated', 'Outdated') : null
      }))
  ].sort((a, b) => (a.anchor?.startLine ?? 0) - (b.anchor?.startLine ?? 0))

  if (comments.length === 0) {
    return null
  }
  return (
    <div className="shrink-0 border-b border-border">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        {translate('azureDevOpsReview.fileComments', 'Comments on this file ({{value0}})', {
          value0: comments.length
        })}
      </button>
      {open ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto px-3 pb-2 scrollbar-sleek">
          {comments.map((comment) => (
            <li key={comment.key} className="flex items-start gap-2 text-xs">
              {comment.draft ? (
                <MessageSquareDashed className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              ) : (
                <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="w-16 shrink-0 font-mono text-muted-foreground">
                {lineLabel(comment.anchor)}
              </span>
              <span className="min-w-0 flex-1 truncate" title={comment.text}>
                <span className="font-medium">{comment.author}</span>
                {comment.status ? (
                  <span className="text-muted-foreground"> · {comment.status}</span>
                ) : null}
                <span className="text-muted-foreground">
                  {' '}
                  — {comment.text.replace(/\s+/g, ' ')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
