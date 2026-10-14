import type { DecoratedDiffComment } from '@/components/diff-comments/decorated-diff-comment'
import { translate } from '@/i18n/i18n'
import type {
  AzureDevOpsLineAnchor,
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView
} from '../../../../shared/azure-devops-review-types'
import { threadStatusLabel } from './azure-devops-review-labels'

const DRAFT_PREFIX = 'azure-devops-draft:'
const THREAD_PREFIX = 'azure-devops-thread:'

/** Pseudo worktree id that scopes a pull request's inline comments in the diff decorator. */
export function azureDevOpsInlineCommentScope(pullRequestKey: string): string {
  return `azure-devops-pr:${pullRequestKey}`
}

export function azureDevOpsDraftIdFromInlineComment(commentId: string): string | null {
  return commentId.startsWith(DRAFT_PREFIX) ? commentId.slice(DRAFT_PREFIX.length) : null
}

function draftAuthor(draft: AzureDevOpsReviewDraftView): string {
  const name =
    draft.author.kind === 'agent'
      ? (draft.author.label ?? translate('azureDevOpsReview.agentAuthor', 'Agent'))
      : translate('azureDevOpsReview.youAuthor', 'You')
  return translate('azureDevOpsReview.inlineDraftAuthor', '{{value0}} · draft', { value0: name })
}

// The decorator renders only on the new side; old-side anchors stay in the file comment list.
function rightAnchor(anchor: AzureDevOpsLineAnchor | null): AzureDevOpsLineAnchor | null {
  return anchor?.side === 'right' ? anchor : null
}

/**
 * Published threads and unpublished drafts placed under the lines they belong to, so the diff
 * reads as it will in Azure DevOps after publishing.
 */
export function buildAzureDevOpsInlineComments(
  detail: AzureDevOpsReviewDetail
): DecoratedDiffComment[] {
  const scope = azureDevOpsInlineCommentScope(detail.pullRequest.key)
  const now = Date.now()
  const comments: DecoratedDiffComment[] = []
  const threadAnchors = new Map<number, { filePath: string; anchor: AzureDevOpsLineAnchor }>()

  for (const thread of detail.threads) {
    const anchor = rightAnchor(thread.anchor)
    const visible = thread.comments.filter((comment) => !comment.isSystem)
    if (!thread.filePath || !anchor || visible.length === 0) {
      continue
    }
    threadAnchors.set(thread.id, { filePath: thread.filePath, anchor })
    const [first, ...replies] = visible
    const publishedAt = first.publishedAt ? new Date(first.publishedAt).getTime() : Number.NaN
    comments.push({
      id: `${THREAD_PREFIX}${thread.id}`,
      worktreeId: scope,
      filePath: thread.filePath,
      source: 'diff',
      startLine: anchor.startLine,
      lineNumber: anchor.endLine,
      body: [
        first.content,
        ...replies.map((reply) => `↳ ${reply.author.displayName}: ${reply.content}`)
      ].join('\n\n'),
      createdAt: Number.isFinite(publishedAt) ? publishedAt : now,
      side: 'modified',
      author: first.author.displayName,
      createdAtLabel: threadStatusLabel(thread.status),
      url: `${detail.pullRequest.webUrl}?_a=files&path=${encodeURIComponent(`/${thread.filePath}`)}&discussionId=${thread.id}`,
      canDelete: false,
      canEdit: false
    })
  }

  for (const draft of detail.drafts) {
    // Why: an outdated draft's lines may have moved, so it would sit under unrelated code.
    if (draft.state === 'published' || draft.outdated) {
      continue
    }
    const inlineAnchor = draft.kind === 'inline' ? rightAnchor(draft.anchor) : null
    const placement =
      inlineAnchor && draft.filePath
        ? { filePath: draft.filePath, anchor: inlineAnchor }
        : draft.kind === 'reply' && draft.threadId !== null
          ? (threadAnchors.get(draft.threadId) ?? null)
          : null
    if (!placement) {
      continue
    }
    comments.push({
      id: `${DRAFT_PREFIX}${draft.id}`,
      worktreeId: scope,
      filePath: placement.filePath,
      source: 'diff',
      startLine: placement.anchor.startLine,
      lineNumber: placement.anchor.endLine,
      body: draft.body,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      side: 'modified',
      author: draftAuthor(draft),
      createdAtLabel:
        draft.kind === 'reply'
          ? translate('azureDevOpsReview.inlineDraftReply', 'reply to #{{value0}}', {
              value0: draft.threadId ?? '?'
            })
          : undefined,
      canDelete: true,
      canEdit: true
    })
  }
  return comments
}
