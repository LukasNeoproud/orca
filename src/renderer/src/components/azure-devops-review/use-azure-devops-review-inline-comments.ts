import { useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type {
  DecoratedDiffComment,
  InlineDiffCommentActions
} from '@/components/diff-comments/decorated-diff-comment'
import {
  deleteAzureDevOpsReviewDraft,
  updateAzureDevOpsReviewDraft
} from '@/lib/azure-devops-review-client'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import {
  azureDevOpsDraftIdFromInlineComment,
  azureDevOpsInlineCommentScope,
  buildAzureDevOpsInlineComments
} from './azure-devops-review-inline-comments'

/** Threads and drafts for the diff decorator, with edit/delete wired to the draft store. */
export function useAzureDevOpsReviewInlineComments(
  detail: AzureDevOpsReviewDetail,
  onChanged: () => Promise<void>
): {
  scope: string
  comments: DecoratedDiffComment[]
  actions: InlineDiffCommentActions
} {
  const comments = useMemo(() => buildAzureDevOpsInlineComments(detail), [detail])
  // Why: a stable actions object keeps every mounted diff from re-running its decorator on reload.
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const actions = useMemo<InlineDiffCommentActions>(
    () => ({
      onDelete: (commentId) => {
        const draftId = azureDevOpsDraftIdFromInlineComment(commentId)
        if (!draftId) {
          return
        }
        deleteAzureDevOpsReviewDraft(draftId)
          .then(() => onChangedRef.current())
          .catch((error: unknown) =>
            toast.error(error instanceof Error ? error.message : String(error))
          )
      },
      onUpdate: async (commentId, body) => {
        const draftId = azureDevOpsDraftIdFromInlineComment(commentId)
        if (!draftId) {
          return false
        }
        try {
          await updateAzureDevOpsReviewDraft(draftId, { body })
          await onChangedRef.current()
          return true
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
          return false
        }
      }
    }),
    []
  )
  return { scope: azureDevOpsInlineCommentScope(detail.pullRequest.key), comments, actions }
}
