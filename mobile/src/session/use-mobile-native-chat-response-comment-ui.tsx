import { useCallback, useState } from 'react'
import type { AiResponseComment } from '../../../src/shared/ai-response-comments'
import {
  MobileAiResponseCommentEditor,
  MobileAiResponseCommentsSheet
} from './MobileAiResponseCommentSheets'

export function useMobileNativeChatResponseCommentUi(args: {
  sendSurfaceId: string
  comments: readonly AiResponseComment[]
  onAdd: (quote: string, comment: string) => void
  onUpdate: (comment: AiResponseComment) => void
  onDelete: (id: string) => void
}) {
  const { sendSurfaceId, comments, onAdd, onUpdate, onDelete } = args
  const [state, setState] = useState<{
    surfaceId: string
    editorDraft: AiResponseComment | null
    commentsVisible: boolean
  }>({ surfaceId: sendSurfaceId, editorDraft: null, commentsVisible: false })
  const editorDraft = state.surfaceId === sendSurfaceId ? state.editorDraft : null
  const commentsVisible = state.surfaceId === sendSurfaceId && state.commentsVisible

  const onCommentQuote = useCallback(
    (quote: string) =>
      setState({
        surfaceId: sendSurfaceId,
        editorDraft: { id: '', quote, comment: '' },
        commentsVisible: false
      }),
    [sendSurfaceId]
  )
  const drawers = (
    <>
      <MobileAiResponseCommentsSheet
        visible={commentsVisible}
        comments={comments}
        onClose={() =>
          setState({ surfaceId: sendSurfaceId, editorDraft: null, commentsVisible: false })
        }
        onEdit={(comment) => {
          setState({ surfaceId: sendSurfaceId, editorDraft: comment, commentsVisible: false })
        }}
        onDelete={onDelete}
      />
      <MobileAiResponseCommentEditor
        draft={editorDraft}
        onClose={() =>
          setState({ surfaceId: sendSurfaceId, editorDraft: null, commentsVisible: false })
        }
        onSave={(comment) => {
          if (!editorDraft) {
            return
          }
          if (editorDraft.id) {
            onUpdate({ ...editorDraft, comment })
          } else {
            onAdd(editorDraft.quote, comment)
          }
          setState({ surfaceId: sendSurfaceId, editorDraft: null, commentsVisible: false })
        }}
      />
    </>
  )

  const openComments = useCallback(
    () => setState({ surfaceId: sendSurfaceId, editorDraft: null, commentsVisible: true }),
    [sendSurfaceId]
  )
  return { onCommentQuote, openComments, drawers }
}
