import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceCursor,
  PortableConversationSourceIdentity
} from './portable-conversation-source'
import type { StructuredTopicAnchor, StructuredTopicIndex } from './structured-topic-index'

export type PortableConversationTopicAnchors = Record<string, PortableConversationSourceAnchor>

export type PortableConversationTopicIndexParams = {
  source: PortableConversationSource
  /** Explicitly continues a bounded initial scan or checks the verified tail for appended turns. */
  refresh?: true
  /** Checks one bounded page only when the persisted preference still enables automation. */
  autoRefresh?: true
}

export type PortableConversationTopicIndexResult = {
  index: StructuredTopicIndex
  anchors: PortableConversationTopicAnchors
  /** Verified source order for manual split points; absent on older portable hosts. */
  positions?: Record<string, StructuredTopicAnchor>
  limited: boolean
}

export type PortableConversationTopicIndexWriteParams = {
  source: PortableConversationSource
  index: StructuredTopicIndex
  expectedRevision: number
}

export type PortableConversationTopicIndexWriteResult = PortableConversationTopicIndexResult

export type PortableConversationPendingTopicTurn = {
  prompt: string
  start: StructuredTopicAnchor
  anchor: PortableConversationSourceAnchor
}

export type PortableConversationPendingTopicAssistant = {
  messageId: string
  reply: string
  end: StructuredTopicAnchor
}

export type PortableConversationTopicScan = {
  cursor: PortableConversationSourceCursor
  /** The cursor points at the final page already read, so its prior messages must be skipped. */
  tailReplay: boolean
  lastProcessedMessageId: string | null
  nextSequence: number
  pendingUser: PortableConversationPendingTopicTurn | null
  pendingAssistant?: PortableConversationPendingTopicAssistant | null
  limited: boolean
}

export type PortableConversationTopicIndexRecord = {
  schemaVersion: 1
  sessionId: string
  source: PortableConversationSource
  identity: PortableConversationSourceIdentity
  index: StructuredTopicIndex
  anchors: PortableConversationTopicAnchors
  /** Verified transcript positions, including assistant endpoints; not exposed as navigation. */
  positions: Record<string, StructuredTopicAnchor>
  scan: PortableConversationTopicScan
  createdAt: number
  updatedAt: number
}

const MAX_INDEXED_MESSAGES = 20_000

export function isPortableConversationTopicIndexRecord(
  value: unknown
): value is PortableConversationTopicIndexRecord {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return false
  }
  const source = value.source
  const index = value.index
  const scan = value.scan
  return (
    bounded(value.sessionId, 512) &&
    validSource(source) &&
    validIdentity(value.identity) &&
    validTopicIndex(index, value.sessionId) &&
    validAnchors(value.anchors) &&
    validPositions(value.positions) &&
    isRecord(scan) &&
    validCursor(scan.cursor) &&
    typeof scan.tailReplay === 'boolean' &&
    (scan.lastProcessedMessageId === null || bounded(scan.lastProcessedMessageId, 4096)) &&
    typeof scan.nextSequence === 'number' &&
    Number.isSafeInteger(scan.nextSequence) &&
    scan.nextSequence >= 0 &&
    (scan.pendingUser === null || validPending(scan.pendingUser)) &&
    (scan.pendingAssistant === undefined ||
      scan.pendingAssistant === null ||
      validPendingAssistant(scan.pendingAssistant)) &&
    typeof scan.limited === 'boolean' &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt)
  )
}

function validPendingAssistant(value: unknown): value is PortableConversationPendingTopicAssistant {
  return (
    isRecord(value) &&
    bounded(value.messageId, 4096) &&
    bounded(value.reply, 1_000) &&
    validTopicAnchor(value.end)
  )
}

function validPositions(value: unknown): value is Record<string, StructuredTopicAnchor> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= MAX_INDEXED_MESSAGES &&
    Object.entries(value).every(
      ([itemId, anchor]) => bounded(itemId, 4096) && validTopicAnchor(anchor)
    )
  )
}

function validSource(value: unknown): value is PortableConversationSource {
  if (!isRecord(value) || !isRecord(value.workspace) || !isRecord(value.provider)) {
    return false
  }
  return (
    bounded(value.executionHostId, 512) &&
    value.executionHostId.startsWith('ssh:') &&
    bounded(value.workspace.id, 4096) &&
    bounded(value.workspace.path, 4096) &&
    (value.workspace.kind === 'git-worktree' || value.workspace.kind === 'folder') &&
    (value.provider.agent === 'claude' || value.provider.agent === 'codex') &&
    bounded(value.provider.sessionId, 512) &&
    bounded(value.transcriptPath, 4096)
  )
}

function validTopicIndex(value: unknown, sessionId: string): value is StructuredTopicIndex {
  if (!isRecord(value) || value.sessionId !== sessionId || !Array.isArray(value.chapters)) {
    return false
  }
  return (
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    typeof value.automatic === 'boolean' &&
    value.chapters.length <= 2_000 &&
    value.chapters.every((chapter) => {
      if (!isRecord(chapter)) {
        return false
      }
      return (
        bounded(chapter.id, 512) &&
        bounded(chapter.title, 120) &&
        validTopicAnchor(chapter.start) &&
        validTopicAnchor(chapter.end) &&
        (chapter.titleSource === 'automatic' || chapter.titleSource === 'manual') &&
        typeof chapter.boundaryAfterManual === 'boolean'
      )
    })
  )
}

function validAnchors(value: unknown): value is PortableConversationTopicAnchors {
  return (
    isRecord(value) &&
    Object.keys(value).length <= MAX_INDEXED_MESSAGES &&
    Object.entries(value).every(
      ([itemId, anchor]) => bounded(itemId, 4096) && validPortableAnchor(anchor)
    )
  )
}

function validPending(value: unknown): value is PortableConversationPendingTopicTurn {
  return (
    isRecord(value) &&
    bounded(value.prompt, 1_000) &&
    validTopicAnchor(value.start) &&
    validPortableAnchor(value.anchor)
  )
}

function validPortableAnchor(value: unknown): value is PortableConversationSourceAnchor {
  return (
    isRecord(value) &&
    bounded(value.messageId, 4096) &&
    validCursor(value.cursor) &&
    validIdentity(value.identity) &&
    (value.selectedText === undefined || bounded(value.selectedText, 256 * 1024))
  )
}

function validTopicAnchor(value: unknown): value is StructuredTopicAnchor {
  return (
    isRecord(value) &&
    bounded(value.epoch, 4096) &&
    bounded(value.itemId, 4096) &&
    typeof value.sequence === 'number' &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 0
  )
}

function validCursor(value: unknown): value is PortableConversationSourceCursor {
  return (
    isRecord(value) &&
    typeof value.offset === 'number' &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0 &&
    (value.boundaryCheckpoint === null || bounded(value.boundaryCheckpoint, 4096)) &&
    bounded(value.fileFingerprint, 4096)
  )
}

function validIdentity(value: unknown): value is PortableConversationSourceIdentity {
  return (
    isRecord(value) &&
    bounded(value.fingerprint, 4096) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    Number.isFinite(value.mtimeMs)
  )
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
