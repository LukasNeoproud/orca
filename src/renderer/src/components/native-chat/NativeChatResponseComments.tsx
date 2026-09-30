import { useCallback, useEffect, type RefObject } from 'react'
import { ResponseCommentPopover } from '@/components/response-comments/ResponseCommentPopover'
import { useResponseCommentSelection } from '@/components/response-comments/use-response-comment-selection'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { appendNativeChatResponseComment } from './native-chat-draft-cache'

export function NativeChatResponseComments({
  paneKey,
  rootRef,
  composerRef
}: {
  paneKey: string
  rootRef: RefObject<HTMLDivElement | null>
  composerRef: RefObject<NativeChatComposerHandle | null>
}): React.JSX.Element {
  const selection = useResponseCommentSelection(rootRef)

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    root.addEventListener('mouseup', selection.captureSelection)
    root.addEventListener('keyup', selection.captureSelection)
    root.addEventListener('scroll', selection.dismissIfIdle, true)
    return () => {
      root.removeEventListener('mouseup', selection.captureSelection)
      root.removeEventListener('keyup', selection.captureSelection)
      root.removeEventListener('scroll', selection.dismissIfIdle, true)
    }
  }, [rootRef, selection.captureSelection, selection.dismissIfIdle])

  const save = useCallback(
    (comment: string): boolean => {
      if (!selection.selection) {
        return false
      }
      if (composerRef.current?.addResponseComment?.(selection.selection.quote, comment)) {
        return true
      }
      appendNativeChatResponseComment(paneKey, selection.selection.quote, comment)
      return true
    },
    [composerRef, paneKey, selection.selection]
  )

  return (
    <ResponseCommentPopover
      selection={selection.selection}
      onEditingChange={selection.onEditingChange}
      onDismiss={selection.dismissSelection}
      onSave={save}
    />
  )
}
