import { useCallback } from 'react'
import { appendAiResponseComments } from '../../../src/shared/ai-response-comments'
import type { MobileNativeChatSendOutcome } from './mobile-native-chat-send'
import { useMobileAiResponseComments } from './use-mobile-ai-response-comments'

type ResponseCommentAttachment = {
  id?: string
  path: string
  previewUri: string
}

type LegacyCommentAwareSend = (
  text: string,
  images?: string[],
  deadline?: number,
  composerDraftText?: string
) => Promise<MobileNativeChatSendOutcome>

type StructuredCommentAwareSend = (
  text: string,
  images?: string[],
  deadline?: number,
  attachments?: readonly ResponseCommentAttachment[],
  composerDraftText?: string
) => Promise<MobileNativeChatSendOutcome>

export function useMobileNativeChatResponseCommentSend(
  scopeKey: string | null,
  structured: boolean,
  sends: { legacy: LegacyCommentAwareSend; structured: StructuredCommentAwareSend }
) {
  const { legacy: legacySend, structured: structuredSend } = sends
  const responseComments = useMobileAiResponseComments(scopeKey)
  const sendWithOutcome = useCallback(
    async (
      draftText: string,
      images?: string[],
      deadline?: number,
      attachments?: readonly ResponseCommentAttachment[]
    ) => {
      const comments = responseComments.commentsRef.current
      const wireText = appendAiResponseComments(draftText, comments)
      const outcome = structured
        ? await structuredSend(wireText, images, deadline, attachments, draftText)
        : await legacySend(wireText, images, deadline, draftText)
      if (outcome !== 'rejected' && comments.length > 0) {
        responseComments.clearComments(comments)
      }
      return outcome
    },
    [legacySend, responseComments.clearComments, structured, structuredSend]
  )
  const send = useCallback(
    async (
      text: string,
      images?: string[],
      deadline?: number,
      attachments?: readonly ResponseCommentAttachment[]
    ) => (await sendWithOutcome(text, images, deadline, attachments)) !== 'rejected',
    [sendWithOutcome]
  )

  return { responseComments, send, sendWithOutcome }
}
