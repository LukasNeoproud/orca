import { AGENT_SESSION_HISTORY_MAX_LIMIT } from '../../shared/agent-session-wire'
import {
  isCodexAppServerRequestError,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import {
  CODEX_RESTORE_MAX_BYTES,
  CODEX_RESTORE_MAX_OPERATIONS
} from './codex-structured-journal-translation-restore'
import type { CodexOpenedThread } from './codex-structured-thread-open'
import { readCodexThreadId } from './codex-structured-thread-facts'

const MAX_HISTORY_PAGES = 100

export class CodexStructuredHistoryLimitError extends Error {
  constructor() {
    super('Codex thread history exceeds the bounded restore queue')
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('codex app-server returned invalid paginated thread history')
  }
  return value as Record<string, unknown>
}

function cursor(value: unknown): string | null {
  if (value === null || (typeof value === 'string' && value.length > 0)) {
    return value
  }
  throw new Error('codex app-server returned an invalid thread history cursor')
}

async function readCodexThreadTurns(
  connection: Pick<CodexAppServerConnection, 'request'>,
  threadId: string,
  timeoutMs: number | undefined
): Promise<Record<string, unknown>[]> {
  const descending: Record<string, unknown>[] = []
  const turnIds = new Set<string>()
  const seenCursors = new Set<string>()
  let next: string | null = null
  let bytes = 0
  let entries = 0

  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    if (next !== null) {
      if (seenCursors.has(next)) {
        throw new CodexStructuredHistoryLimitError()
      }
      seenCursors.add(next)
    }
    const result = record(
      await connection.request(
        'thread/turns/list',
        {
          threadId,
          cursor: next,
          sortDirection: 'desc',
          itemsView: 'full',
          limit: AGENT_SESSION_HISTORY_MAX_LIMIT
        },
        { timeoutMs }
      )
    )
    if (!Array.isArray(result.data)) {
      throw new Error('codex app-server returned an invalid thread history page')
    }
    bytes += Buffer.byteLength(JSON.stringify(result), 'utf8')
    for (const value of result.data) {
      const turn = record(value)
      if (typeof turn.id !== 'string' || !turn.id || turnIds.has(turn.id)) {
        throw new Error('codex app-server returned an invalid thread history turn')
      }
      if (!Array.isArray(turn.items)) {
        throw new Error('codex app-server omitted full items from thread history')
      }
      turnIds.add(turn.id)
      entries += turn.items.length + 1
      descending.push(turn)
    }
    if (bytes > CODEX_RESTORE_MAX_BYTES || entries > CODEX_RESTORE_MAX_OPERATIONS) {
      throw new CodexStructuredHistoryLimitError()
    }
    next = cursor(result.nextCursor)
    if (next === null) {
      return descending.toReversed()
    }
  }
  throw new CodexStructuredHistoryLimitError()
}

function isFullTurnPagingUnsupported(error: unknown): boolean {
  return (
    isCodexAppServerRequestError(error) &&
    (error.code === -32601 ||
      (error.code === -32602 &&
        /(?:unknown|unexpected|unsupported|unrecognized).{0,80}itemsView|itemsView.{0,80}(?:unknown|unexpected|unsupported|unrecognized)/i.test(
          error.message
        )))
  )
}

function validateFullThread(thread: Record<string, unknown>, encodedBytes: number): void {
  if (!Array.isArray(thread.turns)) {
    throw new Error('codex app-server omitted turns from full thread history')
  }
  const ids = new Set<string>()
  let entries = 0
  for (const value of thread.turns) {
    const turn = record(value)
    if (typeof turn.id !== 'string' || !turn.id || ids.has(turn.id)) {
      throw new Error('codex app-server returned an invalid thread history turn')
    }
    if (!Array.isArray(turn.items)) {
      throw new Error('codex app-server omitted full items from thread history')
    }
    ids.add(turn.id)
    entries += turn.items.length + 1
  }
  if (encodedBytes > CODEX_RESTORE_MAX_BYTES || entries > CODEX_RESTORE_MAX_OPERATIONS) {
    throw new CodexStructuredHistoryLimitError()
  }
}

async function readLegacyFullThread(
  connection: Pick<CodexAppServerConnection, 'request'>,
  threadId: string,
  timeoutMs: number | undefined
): Promise<Record<string, unknown>> {
  const result = record(
    await connection.request('thread/read', { threadId, includeTurns: true }, { timeoutMs })
  )
  if (readCodexThreadId(result) !== threadId) {
    throw new Error('codex app-server returned history for a different thread')
  }
  const thread = record(result.thread)
  validateFullThread(thread, Buffer.byteLength(JSON.stringify(result), 'utf8'))
  return thread
}

/** Fully buffer and validate provider history before the caller can enqueue any rows. */
export async function readCodexStructuredSessionHistory(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  opened: CodexOpenedThread
  timeoutMs?: number
}): Promise<Record<string, unknown>> {
  if (!input.opened.historyRequiresRead) {
    return input.opened.thread ?? {}
  }
  try {
    return {
      ...input.opened.thread,
      turns: await readCodexThreadTurns(input.connection, input.opened.threadId, input.timeoutMs)
    }
  } catch (error) {
    if (!isFullTurnPagingUnsupported(error)) {
      throw error
    }
    return readLegacyFullThread(input.connection, input.opened.threadId, input.timeoutMs)
  }
}
