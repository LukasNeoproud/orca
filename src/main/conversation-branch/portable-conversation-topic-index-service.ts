import type { NativeChatMessage } from '../../shared/native-chat-types'
import { portableConversationSourceSessionId } from '../../shared/portable-conversation-branch'
import type {
  PortableConversationSource,
  PortableConversationSourcePage
} from '../../shared/portable-conversation-source'
import {
  isPortableConversationTopicIndexRecord,
  type PortableConversationTopicIndexParams,
  type PortableConversationTopicIndexRecord,
  type PortableConversationTopicIndexResult,
  type PortableConversationTopicIndexWriteParams
} from '../../shared/portable-conversation-topic-index'
import {
  appendAutomaticTopicTurn,
  emptyStructuredTopicIndex,
  type StructuredTopicAnchor,
  type StructuredTopicIndex
} from '../../shared/structured-topic-index'
import type { PortableConversationTopicIndexStore } from '../runtime/portable-conversation-topic-index-store'

export type PortableConversationTopicIndexDependencies = {
  store: PortableConversationTopicIndexStore
  readPage: (params: {
    source: PortableConversationSource
    cursor?: PortableConversationSourcePage['cursor']
    pendingAssistantMessageId?: string | null
  }) => Promise<PortableConversationSourcePage>
  now?: () => number
}

const MAX_INDEXED_MESSAGES = 20_000
const MAX_TOPIC_CHAPTERS = 2_000

export async function readPortableConversationTopicIndex(
  dependencies: PortableConversationTopicIndexDependencies,
  params: PortableConversationTopicIndexParams
): Promise<PortableConversationTopicIndexResult> {
  const sessionId = portableConversationSourceSessionId(params.source)
  return dependencies.store.runExclusive(sessionId, async () => {
    const current = dependencies.store.get(sessionId)
    if (current) {
      assertSameSource(current.source, params.source)
      if (!params.refresh && !(params.autoRefresh && current.index.automatic)) {
        return result(current)
      }
    }
    const page = await dependencies.readPage({
      source: params.source,
      ...(current ? { cursor: current.scan.cursor } : {}),
      ...(current?.scan.pendingAssistant
        ? { pendingAssistantMessageId: current.scan.pendingAssistant.messageId }
        : {})
    })
    const record = scanPage(current, params.source, page, dependencies.now?.())
    return result(await dependencies.store.put(record))
  })
}

export async function writePortableConversationTopicIndex(
  dependencies: Pick<PortableConversationTopicIndexDependencies, 'store' | 'now'>,
  params: PortableConversationTopicIndexWriteParams
): Promise<PortableConversationTopicIndexResult> {
  const sessionId = portableConversationSourceSessionId(params.source)
  const current = dependencies.store.get(sessionId)
  if (!current) {
    throw new Error('portable_conversation_topic_index_missing')
  }
  assertSameSource(current.source, params.source)
  if (
    !isPortableConversationTopicIndexRecord({
      ...current,
      index: params.index,
      updatedAt: dependencies.now?.() ?? Date.now()
    })
  ) {
    throw new Error('portable_conversation_topic_index_invalid')
  }
  assertVerifiedChapterAnchors(current, params.index)
  return result(
    await dependencies.store.writeIndex(
      sessionId,
      params.index,
      params.expectedRevision,
      dependencies.now?.()
    )
  )
}

function scanPage(
  current: PortableConversationTopicIndexRecord | null,
  source: PortableConversationSource,
  page: PortableConversationSourcePage,
  clock?: number
): PortableConversationTopicIndexRecord {
  const now = clock ?? Date.now()
  let index: StructuredTopicIndex =
    current?.index ?? emptyStructuredTopicIndex(portableConversationSourceSessionId(source))
  let pending = current?.scan.pendingUser ?? null
  let pendingAssistant = current?.scan.pendingAssistant ?? null
  let sequence = current?.scan.nextSequence ?? 0
  const anchors = new Map(Object.entries(current?.anchors ?? {}))
  const positions = new Map(Object.entries(current?.positions ?? {}))
  const messages = unreadMessages(current, page)
  if (!page.turnEvidence) {
    throw new Error('portable_conversation_topic_index_completion_unverifiable')
  }
  const completed = new Set(page.turnEvidence.completedAssistantMessageIds)
  const pendingEvidence = page.turnEvidence.pendingAssistantMessageId
  let lastProcessedMessageId = current?.scan.lastProcessedMessageId ?? null
  ;({ index, pending, pendingAssistant } = settlePendingAssistant({
    index,
    pending,
    pendingAssistant,
    completed
  }))
  for (const message of messages) {
    if (sequence >= MAX_INDEXED_MESSAGES) {
      throw new Error('portable_conversation_topic_index_history_limit')
    }
    const anchor = portableAnchor(message, page)
    const topicAnchor = structuredAnchor(message, page, sequence++)
    positions.set(message.id, topicAnchor)
    lastProcessedMessageId = message.id
    if (message.role === 'user') {
      anchors.set(message.id, anchor)
      const prompt = messageText(message).slice(0, 1_000)
      pending = prompt ? { prompt, start: topicAnchor, anchor } : null
      pendingAssistant = null
    } else if (message.role === 'assistant' && pending) {
      const reply = messageText(message).slice(0, 1_000)
      const isCompletionCandidate = completed.has(message.id) || pendingEvidence === message.id
      pendingAssistant =
        reply && isCompletionCandidate ? { messageId: message.id, reply, end: topicAnchor } : null
      ;({ index, pending, pendingAssistant } = settlePendingAssistant({
        index,
        pending,
        pendingAssistant,
        completed
      }))
      if (index.chapters.length > MAX_TOPIC_CHAPTERS) {
        throw new Error('portable_conversation_topic_index_history_limit')
      }
    }
  }
  const nextCursor = page.nextCursor
  return {
    schemaVersion: 1,
    sessionId: index.sessionId,
    source,
    identity: page.identity,
    index,
    anchors: Object.fromEntries(anchors),
    positions: Object.fromEntries(positions),
    scan: {
      cursor: nextCursor ?? page.cursor,
      tailReplay: nextCursor === null,
      lastProcessedMessageId,
      nextSequence: sequence,
      pendingUser: pending,
      pendingAssistant,
      limited: nextCursor !== null
    },
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  }
}

function settlePendingAssistant(args: {
  index: StructuredTopicIndex
  pending: PortableConversationTopicIndexRecord['scan']['pendingUser']
  pendingAssistant: NonNullable<
    PortableConversationTopicIndexRecord['scan']['pendingAssistant']
  > | null
  completed: ReadonlySet<string>
}): {
  index: StructuredTopicIndex
  pending: PortableConversationTopicIndexRecord['scan']['pendingUser']
  pendingAssistant: NonNullable<
    PortableConversationTopicIndexRecord['scan']['pendingAssistant']
  > | null
} {
  if (
    !args.pending ||
    !args.pendingAssistant ||
    !args.completed.has(args.pendingAssistant.messageId)
  ) {
    return args
  }
  return {
    index: appendAutomaticTopicTurn(args.index, {
      start: args.pending.start,
      end: args.pendingAssistant.end,
      prompt: args.pending.prompt,
      reply: args.pendingAssistant.reply
    }),
    pending: null,
    pendingAssistant: null
  }
}

function assertVerifiedChapterAnchors(
  record: PortableConversationTopicIndexRecord,
  index: StructuredTopicIndex
): void {
  const chapterIds = new Set<string>()
  let previousEnd: StructuredTopicAnchor | null = null
  for (const chapter of index.chapters) {
    if (
      chapterIds.has(chapter.id) ||
      !chapter.title.trim() ||
      !Object.hasOwn(record.anchors, chapter.start.itemId)
    ) {
      throw new Error('portable_conversation_topic_index_anchor_invalid')
    }
    chapterIds.add(chapter.id)
    for (const anchor of [chapter.start, chapter.end]) {
      const verified = Object.hasOwn(record.positions, anchor.itemId)
        ? record.positions[anchor.itemId]
        : undefined
      if (!verified || verified.epoch !== anchor.epoch || verified.sequence !== anchor.sequence) {
        throw new Error('portable_conversation_topic_index_anchor_invalid')
      }
    }
    if (
      chapter.start.epoch !== chapter.end.epoch ||
      chapter.start.sequence > chapter.end.sequence ||
      (previousEnd !== null &&
        (previousEnd.epoch !== chapter.start.epoch ||
          previousEnd.sequence > chapter.start.sequence))
    ) {
      throw new Error('portable_conversation_topic_index_anchor_invalid')
    }
    previousEnd = chapter.end
  }
}

function unreadMessages(
  current: PortableConversationTopicIndexRecord | null,
  page: PortableConversationSourcePage
): NativeChatMessage[] {
  if (!current?.scan.tailReplay || !current.scan.lastProcessedMessageId) {
    return page.transcriptMessages
  }
  const position = page.transcriptMessages.findIndex(
    (message) => message.id === current.scan.lastProcessedMessageId
  )
  if (position === -1) {
    throw new Error('portable_conversation_topic_index_source_changed')
  }
  return page.transcriptMessages.slice(position + 1)
}

function portableAnchor(message: NativeChatMessage, page: PortableConversationSourcePage) {
  return { messageId: message.id, cursor: page.cursor, identity: page.identity }
}

function structuredAnchor(
  message: NativeChatMessage,
  page: PortableConversationSourcePage,
  sequence: number
): StructuredTopicAnchor {
  return { epoch: page.identity.fingerprint, itemId: message.id, sequence }
}

function messageText(message: NativeChatMessage): string {
  return message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim()
}

function result(
  record: PortableConversationTopicIndexRecord
): PortableConversationTopicIndexResult {
  return {
    index: record.index,
    anchors: record.anchors,
    positions: record.positions,
    limited: record.scan.limited
  }
}

function assertSameSource(
  left: PortableConversationSource,
  right: PortableConversationSource
): void {
  if (
    left.executionHostId !== right.executionHostId ||
    left.workspace.id !== right.workspace.id ||
    left.workspace.path !== right.workspace.path ||
    left.workspace.kind !== right.workspace.kind ||
    left.provider.agent !== right.provider.agent ||
    left.provider.sessionId !== right.provider.sessionId ||
    left.transcriptPath !== right.transcriptPath
  ) {
    throw new Error('portable_conversation_topic_index_source_mismatch')
  }
}
