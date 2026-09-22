import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { PortableConversationTopicAnchors } from '../../../../shared/portable-conversation-topic-index'
import type { PortableConversationSourceCursor } from '../../../../shared/portable-conversation-source'
import type {
  StructuredTopicAnchor,
  StructuredTopicIndex
} from '../../../../shared/structured-topic-index'

function cursorKey(cursor: PortableConversationSourceCursor): string {
  return JSON.stringify(cursor)
}

/** Derives intermediate user sequences only from a same-page server-owned topic anchor. */
export function portableConversationTopicItems(input: {
  index: StructuredTopicIndex
  anchors: PortableConversationTopicAnchors
  positions?: Record<string, StructuredTopicAnchor>
  messages: readonly NativeChatMessage[]
}): AgentJournalRenderItem[] {
  const messagePosition = new Map(input.messages.map((message, position) => [message.id, position]))
  const exactSequence = new Map(
    Object.entries(input.positions ?? {}).map(([itemId, anchor]) => [itemId, anchor.sequence])
  )
  const pageCalibration = new Map<string, { position: number; sequence: number }>()
  for (const chapter of input.index.chapters) {
    exactSequence.set(chapter.start.itemId, chapter.start.sequence)
    exactSequence.set(chapter.end.itemId, chapter.end.sequence)
    const sourceAnchor = input.anchors[chapter.start.itemId]
    const position = sourceAnchor && messagePosition.get(sourceAnchor.messageId)
    if (position !== undefined) {
      pageCalibration.set(cursorKey(sourceAnchor.cursor), {
        position,
        sequence: chapter.start.sequence
      })
    }
  }
  return Object.entries(input.anchors).flatMap(([itemId, anchor]) => {
    const message = input.messages[messagePosition.get(anchor.messageId) ?? -1]
    const position = messagePosition.get(anchor.messageId)
    const calibration = pageCalibration.get(cursorKey(anchor.cursor))
    const sequence =
      exactSequence.get(itemId) ??
      (position !== undefined && calibration
        ? calibration.sequence + position - calibration.position
        : undefined)
    return message && sequence !== undefined
      ? [
          {
            itemId,
            revision: 0,
            body: { kind: 'message', role: message.role, blocks: message.blocks },
            sequence,
            observedAt: message.timestamp ?? 0
          }
        ]
      : []
  })
}
