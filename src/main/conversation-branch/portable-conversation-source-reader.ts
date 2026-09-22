import {
  verifyPortableConversationSource,
  PortableConversationSourceError
} from './portable-conversation-source-verification'
import type * as Source from '../../shared/portable-conversation-source'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import type { IFilesystemProvider } from '../providers/types'
import {
  readWorkerTranscript,
  type WorkerTranscriptReadResult
} from '../runtime/orchestration/worker-transcript-read'
import {
  remoteWorkerTranscriptSourceIdentity,
  workerTranscriptSourceChanged
} from '../runtime/orchestration/worker-transcript-source-identity'
import {
  formatPortableConversationSourceContext,
  portableConversationSourceMessageText
} from './portable-conversation-source-context'

const PAGE_MESSAGE_LIMIT = 50
const DEFAULT_HISTORY_PAGE_LIMIT = 80
const COMPLETION_PROOF_PAGE_LIMIT = 20

export { PortableConversationSourceError } from './portable-conversation-source-verification'
export type { PortableConversationSourceFailureCode } from './portable-conversation-source-verification'

export type PortableConversationSourceReaderDependencies = {
  listSessions: (source: Source.PortableConversationSource) => Promise<readonly AiVaultSession[]>
  getFilesystemProvider: (executionHostId: `ssh:${string}`) => IFilesystemProvider | null
  readTranscript?: (
    args: Parameters<typeof readWorkerTranscript>[0]
  ) => Promise<WorkerTranscriptReadResult>
}

export type ReadPortableConversationSourcePageArgs = {
  source: Source.PortableConversationSource
  cursor?: Source.PortableConversationSourceCursor
  /** Server-owned cross-page state; never accepted from an RPC cursor. */
  pendingAssistantMessageId?: string | null
}

export type ReadPortableConversationSourceContextArgs = {
  source: Source.PortableConversationSource
  anchor: Source.PortableConversationSourceAnchor
  mode: Source.PortableConversationSourceContextMode
  anchorRole?: 'user' | 'assistant'
  maxHistoryPages?: number
}

export function createPortableConversationSourceReader(
  dependencies: PortableConversationSourceReaderDependencies
): {
  readSession: (source: Source.PortableConversationSource) => Promise<AiVaultSession>
  readPage: (
    args: ReadPortableConversationSourcePageArgs
  ) => Promise<Source.PortableConversationSourcePage>
  readContext: (
    args: ReadPortableConversationSourceContextArgs
  ) => Promise<Source.PortableConversationSourceContext>
} {
  const readPage = (args: ReadPortableConversationSourcePageArgs) =>
    readPortableConversationSourcePage(args, dependencies)
  return {
    readSession: async (source) => {
      const { session, provider } = await verifyPortableConversationSource(source, dependencies)
      await readIdentity(provider, source)
      return session
    },
    readPage,
    readContext: (args) => readPortableConversationSourceContext(args, readPage)
  }
}

export async function readPortableConversationSourcePage(
  args: ReadPortableConversationSourcePageArgs,
  dependencies: PortableConversationSourceReaderDependencies
): Promise<Source.PortableConversationSourcePage> {
  const { provider } = await verifyPortableConversationSource(args.source, dependencies)
  const before = await readIdentity(provider, args.source)
  const cursor = args.cursor
  if (cursor && cursor.fileFingerprint !== before.fingerprint) {
    throw changedSource()
  }
  const result = await (dependencies.readTranscript ?? readWorkerTranscript)({
    agent: args.source.provider.agent,
    sessionId: args.source.provider.sessionId,
    transcriptPath: args.source.transcriptPath,
    // An explicit zero reads chronologically. Undefined is intentionally the tail-reader mode.
    offset: cursor?.offset ?? 0,
    limit: PAGE_MESSAGE_LIMIT,
    ...(cursor ? { expectedSourceFingerprint: cursor.fileFingerprint } : {}),
    ...(cursor?.boundaryCheckpoint
      ? { expectedBoundaryCheckpoint: cursor.boundaryCheckpoint }
      : {}),
    ...(args.pendingAssistantMessageId !== undefined
      ? { pendingAssistantMessageId: args.pendingAssistantMessageId }
      : {}),
    filesystemProvider: provider
  })
  if (!result.ok) {
    throw transcriptFailure(result)
  }
  const after = await readIdentity(provider, args.source)
  if (
    after.fingerprint !== result.sourceFingerprint ||
    workerTranscriptSourceChanged(before, after, before.size)
  ) {
    throw changedSource()
  }
  const pageCursor: Source.PortableConversationSourceCursor = {
    offset: cursor?.offset ?? 0,
    boundaryCheckpoint: cursor?.boundaryCheckpoint ?? null,
    fileFingerprint: after.fingerprint
  }
  const nextCursor =
    result.limited && result.nextOffset > pageCursor.offset
      ? {
          offset: result.nextOffset,
          boundaryCheckpoint: result.boundaryCheckpoint,
          fileFingerprint: after.fingerprint
        }
      : null
  return {
    source: args.source,
    transcriptMessages: result.messages,
    cursor: pageCursor,
    nextCursor,
    identity: after,
    limited: result.limited,
    warnings: result.warnings,
    ...(result.turnEvidence ? { turnEvidence: result.turnEvidence } : {})
  }
}

async function readPortableConversationSourceContext(
  args: ReadPortableConversationSourceContextArgs,
  readPage: (
    args: ReadPortableConversationSourcePageArgs
  ) => Promise<Source.PortableConversationSourcePage>
): Promise<Source.PortableConversationSourceContext> {
  const pages =
    args.mode === 'targeted'
      ? [await readPage({ source: args.source, cursor: args.anchor.cursor })]
      : await readHistoryPages(args, readPage)
  const selected = findSelectedMessage(pages, args.anchor)
  const finalPage = pages.at(-1)!
  if (
    args.anchor.identity.fingerprint !== args.anchor.cursor.fileFingerprint ||
    workerTranscriptSourceChanged(
      args.anchor.identity,
      finalPage.identity,
      args.anchor.identity.size
    )
  ) {
    throw changedSource()
  }
  const selectedText = portableConversationSourceMessageText(selected.message)
  const anchorRole = args.anchorRole ?? 'assistant'
  if (selected.message.role !== anchorRole || (anchorRole === 'user' && args.mode !== 'targeted')) {
    throw new PortableConversationSourceError(
      anchorRole === 'user' ? 'anchor_not_user' : 'anchor_not_assistant',
      anchorRole === 'user'
        ? 'Prompt analysis requires a verified user message and targeted context.'
        : 'Only an assistant response can be used as a related conversation source.'
    )
  }
  if (anchorRole === 'assistant') {
    await requireCompletedAssistant(args.source, selected.message.id, pages, readPage)
  }
  const selectedPassage = selectedPassageFor(args.anchor, selectedText)
  const messages = pages.flatMap((page) => page.transcriptMessages).slice(0, selected.index + 1)
  const formatted = formatPortableConversationSourceContext(args.mode, messages, selectedPassage)
  return {
    source: args.source,
    anchor: args.anchor,
    identity: finalPage.identity,
    verification: { cursor: args.anchor.cursor, selectedMessageId: args.anchor.messageId },
    selectedPassage,
    contextMarkdown: formatted.markdown,
    historyTruncated: formatted.truncated,
    warnings: pages.flatMap((page) => page.warnings)
  }
}

async function requireCompletedAssistant(
  source: Source.PortableConversationSource,
  messageId: string,
  initialPages: readonly Source.PortableConversationSourcePage[],
  readPage: (
    args: ReadPortableConversationSourcePageArgs
  ) => Promise<Source.PortableConversationSourcePage>
): Promise<void> {
  let page = initialPages.at(-1)!
  for (let count = 0; count < COMPLETION_PROOF_PAGE_LIMIT; count++) {
    const evidence = page.turnEvidence
    if (!evidence) {
      throw completionUnverifiable()
    }
    if (evidence.completedAssistantMessageIds.includes(messageId)) {
      return
    }
    if (!page.nextCursor) {
      throw completionUnverifiable()
    }
    page = await readPage({
      source,
      cursor: page.nextCursor,
      pendingAssistantMessageId: evidence.pendingAssistantMessageId
    })
  }
  throw completionUnverifiable()
}

function completionUnverifiable(): PortableConversationSourceError {
  return new PortableConversationSourceError(
    'turn_completion_unverifiable',
    'The selected assistant response is not proven complete in the provider transcript.'
  )
}

async function readHistoryPages(
  args: ReadPortableConversationSourceContextArgs,
  readPage: (
    args: ReadPortableConversationSourcePageArgs
  ) => Promise<Source.PortableConversationSourcePage>
): Promise<Source.PortableConversationSourcePage[]> {
  const pageLimit = Math.min(Math.max(args.maxHistoryPages ?? DEFAULT_HISTORY_PAGE_LIMIT, 1), 200)
  const pages: Source.PortableConversationSourcePage[] = []
  let cursor: Source.PortableConversationSourceCursor = {
    offset: 0,
    boundaryCheckpoint: null,
    fileFingerprint: args.anchor.cursor.fileFingerprint
  }
  for (let count = 0; count < pageLimit; count++) {
    const page = await readPage({ source: args.source, cursor })
    pages.push(page)
    if (page.transcriptMessages.some((message) => message.id === args.anchor.messageId)) {
      return pages
    }
    if (!page.nextCursor) {
      break
    }
    cursor = page.nextCursor
  }
  throw new PortableConversationSourceError(
    'history_limit',
    'The selected response was not reached within the bounded history read. Use its targeted context instead.'
  )
}

function findSelectedMessage(
  pages: readonly Source.PortableConversationSourcePage[],
  anchor: Source.PortableConversationSourceAnchor
): { message: NativeChatMessage; index: number } {
  let index = 0
  for (const page of pages) {
    for (const message of page.transcriptMessages) {
      if (message.id === anchor.messageId) {
        return { message, index }
      }
      index++
    }
  }
  throw new PortableConversationSourceError(
    'anchor_not_found',
    'The selected response is no longer present at its verified transcript location.'
  )
}

function selectedPassageFor(
  anchor: Source.PortableConversationSourceAnchor,
  sourceText: string
): string {
  const selected = anchor.selectedText
  if (!selected) {
    return sourceText
  }
  if (!sourceText.includes(selected)) {
    throw new PortableConversationSourceError(
      'selected_text_mismatch',
      'The selected passage no longer matches the verified assistant response.'
    )
  }
  return selected
}

async function readIdentity(
  provider: IFilesystemProvider,
  source: Source.PortableConversationSource
): Promise<Source.PortableConversationSourceIdentity> {
  const identity = remoteWorkerTranscriptSourceIdentity(await provider.stat(source.transcriptPath))
  if (!identity) {
    throw new PortableConversationSourceError(
      'source_unavailable',
      'The SSH host did not provide a stable identity for the source transcript.'
    )
  }
  return identity
}

function transcriptFailure(result: Exclude<WorkerTranscriptReadResult, { ok: true }>): Error {
  return new PortableConversationSourceError(
    result.reason === 'source_changed' ? 'source_changed' : 'transcript_unreadable',
    result.reason === 'source_changed'
      ? 'The source transcript changed while it was being read.'
      : 'The source transcript could not be read from its SSH host.'
  )
}

function changedSource(): PortableConversationSourceError {
  return new PortableConversationSourceError(
    'source_changed',
    'The source transcript changed while it was being read.'
  )
}
