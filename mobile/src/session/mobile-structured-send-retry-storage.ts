import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AGENT_SESSION_MAX_NEW_OPERATION_AGE_MS,
  AGENT_SESSION_OPERATION_FUTURE_SKEW_MS,
  parseAgentSessionOperationTimestamp
} from '../../../src/shared/agent-session-host-authority'
import type { AgentJournalMessageItem } from '../../../src/shared/agent-session-journal-types'

const STORAGE_KEY = 'orca:structured-send-retry:v1'
const MAX_ENTRIES = 64
const MAX_JOURNAL_BYTES = 256_000
const MAX_BODY_BYTES = 32_000

export type MobileStructuredSendRetryEntry = {
  sessionKey: string
  sessionId: string
  operationId: string
  fence: number
  body: AgentJournalMessageItem
}

let journalBarrier: Promise<void> = Promise.resolve()

function serialized<T>(action: () => Promise<T>): Promise<T> {
  const operation = journalBarrier.then(action, action)
  journalBarrier = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

function validBody(value: unknown): value is AgentJournalMessageItem {
  if (!value || typeof value !== 'object') {
    return false
  }
  const body = value as Partial<AgentJournalMessageItem>
  return (
    body.kind === 'message' &&
    body.role === 'user' &&
    Array.isArray(body.blocks) &&
    body.blocks.length > 0 &&
    body.blocks.length <= 64 &&
    body.blocks.every((block) =>
      block.type === 'text'
        ? typeof block.text === 'string' && block.text.length <= MAX_BODY_BYTES
        : block.type === 'image-ref' &&
          typeof block.path === 'string' &&
          block.path.length > 0 &&
          block.path.length <= 4_096
    ) &&
    JSON.stringify(body).length <= MAX_BODY_BYTES
  )
}

function validEntry(value: unknown): value is MobileStructuredSendRetryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const entry = value as Partial<MobileStructuredSendRetryEntry>
  const timestamp =
    typeof entry.operationId === 'string'
      ? parseAgentSessionOperationTimestamp(entry.operationId)
      : null
  return (
    typeof entry.sessionKey === 'string' &&
    entry.sessionKey.length > 0 &&
    entry.sessionKey.length <= 4_096 &&
    typeof entry.sessionId === 'string' &&
    entry.sessionId.length > 0 &&
    entry.sessionId.length <= 512 &&
    timestamp !== null &&
    Number.isSafeInteger(entry.fence) &&
    entry.fence! >= 0 &&
    validBody(entry.body)
  )
}

function active(entry: MobileStructuredSendRetryEntry, now: number): boolean {
  const timestamp = parseAgentSessionOperationTimestamp(entry.operationId)
  return (
    timestamp !== null &&
    now - timestamp <= AGENT_SESSION_MAX_NEW_OPERATION_AGE_MS &&
    timestamp - now <= AGENT_SESSION_OPERATION_FUTURE_SKEW_MS
  )
}

async function readJournal(): Promise<MobileStructuredSendRetryEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    return []
  }
  if (raw.length > MAX_JOURNAL_BYTES) {
    throw new Error('Saved retry details are too large to read safely.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Saved retry details are unreadable.')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { v?: unknown }).v !== 1 ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new Error('Saved retry details are unreadable.')
  }
  const entries = (parsed as { entries: unknown[] }).entries
  if (entries.length > MAX_ENTRIES || !entries.every(validEntry)) {
    throw new Error('Saved retry details are unreadable.')
  }
  return entries.filter((entry) =>
    active(entry as MobileStructuredSendRetryEntry, Date.now())
  ) as MobileStructuredSendRetryEntry[]
}

async function writeJournal(entries: MobileStructuredSendRetryEntry[]): Promise<void> {
  if (entries.length > MAX_ENTRIES) {
    throw new Error('Too many unconfirmed messages are saved on this device.')
  }
  const raw = JSON.stringify({ v: 1, entries })
  if (raw.length > MAX_JOURNAL_BYTES) {
    throw new Error('Unconfirmed message is too large to save for retry.')
  }
  if (entries.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, raw)
  }
}

export function loadMobileStructuredSendRetries(
  sessionKey: string,
  sessionId: string,
  acceptedIds: ReadonlySet<string>
): Promise<MobileStructuredSendRetryEntry[]> {
  return serialized(async () => {
    const entries = await readJournal()
    const next = entries.filter(
      (entry) => entry.sessionKey !== sessionKey || !acceptedIds.has(entry.operationId)
    )
    if (next.length !== entries.length) {
      await writeJournal(next)
    }
    return next.filter((entry) => entry.sessionKey === sessionKey && entry.sessionId === sessionId)
  })
}

export function saveMobileStructuredSendRetry(
  entry: MobileStructuredSendRetryEntry
): Promise<void> {
  return serialized(async () => {
    if (!validEntry(entry) || !active(entry, Date.now())) {
      throw new Error('Unconfirmed message cannot be saved for retry.')
    }
    const entries = await readJournal()
    await writeJournal([
      ...entries.filter(
        (item) => item.sessionKey !== entry.sessionKey || item.operationId !== entry.operationId
      ),
      entry
    ])
  })
}

export function removeMobileStructuredSendRetries(
  sessionKey: string,
  operationIds: ReadonlySet<string>
): Promise<void> {
  return serialized(async () => {
    const entries = await readJournal()
    const next = entries.filter(
      (entry) => entry.sessionKey !== sessionKey || !operationIds.has(entry.operationId)
    )
    if (next.length !== entries.length) {
      await writeJournal(next)
    }
  })
}

export async function resetMobileStructuredSendRetryStorageForTests(): Promise<void> {
  await journalBarrier
  journalBarrier = Promise.resolve()
}
