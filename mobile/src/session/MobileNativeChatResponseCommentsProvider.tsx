import { useMemo, type ReactNode } from 'react'
import type { useMobileAiResponseComments } from './use-mobile-ai-response-comments'
import { useMobileNativeChatResponseCommentUi } from './use-mobile-native-chat-response-comment-ui'
import { MobileNativeChatResponseCommentsContext } from './mobile-native-chat-response-comments-context'

type ResponseComments = ReturnType<typeof useMobileAiResponseComments>

/** Without comment state (a controller that predates comments) the chat renders unchanged. */
export function MobileNativeChatResponseCommentsProvider({
  comments,
  sendSurfaceId,
  children
}: {
  comments: ResponseComments | undefined
  sendSurfaceId: string
  children?: ReactNode
}): React.JSX.Element {
  return comments ? (
    <ActiveResponseCommentsProvider comments={comments} sendSurfaceId={sendSurfaceId}>
      {children}
    </ActiveResponseCommentsProvider>
  ) : (
    <>{children}</>
  )
}

function ActiveResponseCommentsProvider({
  comments,
  sendSurfaceId,
  children
}: {
  comments: ResponseComments
  sendSurfaceId: string
  children?: ReactNode
}): React.JSX.Element {
  const ui = useMobileNativeChatResponseCommentUi({
    sendSurfaceId,
    comments: comments.comments,
    onAdd: comments.addComment,
    onUpdate: comments.updateComment,
    onDelete: comments.deleteComment
  })
  const count = comments.comments.length
  const { openComments, onCommentQuote } = ui
  const value = useMemo(
    () => ({ count, openComments, onCommentQuote }),
    [count, openComments, onCommentQuote]
  )
  return (
    <MobileNativeChatResponseCommentsContext.Provider value={value}>
      {children}
      {ui.drawers}
    </MobileNativeChatResponseCommentsContext.Provider>
  )
}
