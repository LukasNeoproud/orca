import {
  readNativeChatAttachmentCache,
  writeNativeChatAttachmentCache
} from './use-native-chat-composer-attachments'
import {
  readNativeChatDraftCache,
  readNativeChatResponseComments,
  writeNativeChatDraftCache,
  writeNativeChatResponseComments
} from './native-chat-draft-cache'

type PendingStructuredDraft = {
  text: string
  attachments: ReturnType<typeof readNativeChatAttachmentCache>
  responseComments: ReturnType<typeof readNativeChatResponseComments>
}

const pendingBySessionId = new Map<string, PendingStructuredDraft>()

/** Keeps an unsent composer message with the conversation the user selected. */
export function stageStructuredSessionComposerDraft(input: {
  sourcePaneKey: string
  targetSessionId: string
  prefix?: string
}): void {
  const sourceText = readNativeChatDraftCache(input.sourcePaneKey)
  const text = [input.prefix?.trim(), sourceText]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
  const attachments = readNativeChatAttachmentCache(input.sourcePaneKey)
  const responseComments = readNativeChatResponseComments(input.sourcePaneKey)
  if (!text && attachments.length === 0 && responseComments.length === 0) {
    return
  }
  pendingBySessionId.set(input.targetSessionId, { text, attachments, responseComments })
}

export function adoptStructuredSessionComposerDraft(input: {
  targetPaneKey: string
  sessionId: string
}): void {
  const pending = pendingBySessionId.get(input.sessionId)
  if (!pending) {
    return
  }
  pendingBySessionId.delete(input.sessionId)
  writeNativeChatDraftCache(input.targetPaneKey, pending.text)
  writeNativeChatAttachmentCache(input.targetPaneKey, pending.attachments)
  writeNativeChatResponseComments(input.targetPaneKey, pending.responseComments)
}

export function clearStructuredSessionComposerDraftTransfersForTests(): void {
  pendingBySessionId.clear()
}
