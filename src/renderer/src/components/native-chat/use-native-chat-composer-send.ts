import { useCallback } from 'react'
import type { AiResponseComment } from '../../../../shared/ai-response-comments'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function useNativeChatComposerSend({
  structuredTransport,
  formattedDraft,
  responseComments,
  imageAttachments,
  disabled,
  hasPendingAttachment,
  sendPty,
  sendStructured
}: {
  structuredTransport?: NativeChatStructuredComposerTransport
  formattedDraft: string
  responseComments: readonly AiResponseComment[]
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  disabled: boolean
  hasPendingAttachment: boolean
  sendPty: () => void
  sendStructured: (
    text: string,
    attachments?: readonly NativeChatComposerImageAttachment[],
    comments?: readonly AiResponseComment[]
  ) => void
}): () => void {
  return useCallback(() => {
    if (hasPendingAttachment) {
      return
    }
    if (!structuredTransport) {
      sendPty()
    } else if ((formattedDraft.trim() !== '' || imageAttachments.length > 0) && !disabled) {
      sendStructured(formattedDraft, imageAttachments, responseComments)
    }
  }, [
    disabled,
    formattedDraft,
    hasPendingAttachment,
    imageAttachments,
    responseComments,
    sendPty,
    sendStructured,
    structuredTransport
  ])
}
