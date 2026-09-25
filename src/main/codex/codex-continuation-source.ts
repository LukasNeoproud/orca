import { createHash, type Hash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { ConversationContinuationCheckpoint } from '../../shared/conversation-continuation'
import {
  normalizeRuntimePathForComparison,
  relativePathInsideRoot
} from '../../shared/cross-platform-path'
import { openTranscriptReadStream } from '../native-chat/wsl-transcript-fs-access'
import { isCodexWorkerSession } from '../ai-vault/session-scanner-codex-parser'

const MAX_INSPECTED_LINE_BYTES = 1024 * 1024
const CODEX_ROLLOUT_RELATIVE_PATH = /^\d{4}\/\d{2}\/\d{2}\/rollout-[^/]+\.jsonl$/
const inspectionCache = new Map<
  string,
  { signature: string; result: InspectedCodexContextSource }
>()

export type ResolvedCodexContinuationSource = {
  providerSessionId: string
  workspaceId: string
  cwd: string
  transcriptPath: string
  codexHome: string
}

export type InspectedCodexContinuationSource = {
  checkpoint: ConversationContinuationCheckpoint | null
  checkpointByteOffset: number | null
}

export type InspectedCodexContextSource = InspectedCodexContinuationSource & {
  turnId: string | null
  turnState: 'running' | 'completed' | 'interrupted' | null
  userMessageCount: number
  activityReliable: boolean
  turnContext: Record<string, unknown> | null
  sessionMeta: Record<string, unknown> | null
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function timestamp(value: unknown): string | null {
  const millis =
    typeof value === 'number' && Number.isFinite(value)
      ? value > 1_000_000_000_000
        ? value
        : value * 1000
      : typeof value === 'string'
        ? Date.parse(value)
        : Number.NaN
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null
}

function parseLine(line: Buffer): RecordValue | null {
  if (line.byteLength > MAX_INSPECTED_LINE_BYTES) {
    return null
  }
  try {
    return record(JSON.parse(line.toString('utf8')) as unknown)
  } catch {
    return null
  }
}

function copyRevision(hash: Hash): string {
  return hash.copy().digest('hex')
}

export async function assertTrustedSourcePath(
  source: ResolvedCodexContinuationSource
): Promise<string> {
  if (
    !source.providerSessionId.trim() ||
    !source.workspaceId.trim() ||
    !isAbsolute(source.cwd) ||
    !isAbsolute(source.transcriptPath) ||
    !isAbsolute(source.codexHome)
  ) {
    throw new Error('conversation_continuation_source_invalid')
  }
  const sessionsRoot = join(source.codexHome, 'sessions')
  const relative = relativePathInsideRoot(sessionsRoot, source.transcriptPath)?.replace(/\\/g, '/')
  if (!relative || !CODEX_ROLLOUT_RELATIVE_PATH.test(relative)) {
    throw new Error('conversation_continuation_transcript_untrusted')
  }
  const [realSessionsRoot, realTranscriptPath] = await Promise.all([
    realpath(sessionsRoot),
    realpath(source.transcriptPath)
  ])
  if (!relativePathInsideRoot(realSessionsRoot, realTranscriptPath)) {
    throw new Error('conversation_continuation_transcript_untrusted')
  }
  return realTranscriptPath
}

function assertSourceIdentity(input: {
  source: ResolvedCodexContinuationSource
  sessionId: string | null
  cwd: string | null
  worker: boolean
}): void {
  if (input.worker || input.sessionId !== input.source.providerSessionId) {
    throw new Error('conversation_continuation_source_identity_mismatch')
  }
  if (
    !input.cwd ||
    normalizeRuntimePathForComparison(input.cwd) !==
      normalizeRuntimePathForComparison(input.source.cwd)
  ) {
    throw new Error('conversation_continuation_source_cwd_mismatch')
  }
}

/** Proves the source and finds the last provider-confirmed completed turn. */
export async function inspectCodexContinuationSource(
  source: ResolvedCodexContinuationSource
): Promise<InspectedCodexContinuationSource> {
  const { checkpoint, checkpointByteOffset } = await inspectCodexContextSource(source)
  return { checkpoint, checkpointByteOffset }
}

export async function inspectCodexContextSource(
  source: ResolvedCodexContinuationSource
): Promise<InspectedCodexContextSource> {
  const realTranscriptPath = await assertTrustedSourcePath(source)
  const file = await stat(realTranscriptPath)
  if (!file.isFile()) {
    throw new Error('conversation_continuation_transcript_untrusted')
  }
  const signature = [file.dev, file.ino, file.size, file.mtimeMs, file.ctimeMs].join(':')
  const cacheKey = [
    realTranscriptPath,
    source.providerSessionId,
    normalizeRuntimePathForComparison(source.cwd)
  ].join('\0')
  const cached = inspectionCache.get(cacheKey)
  if (cached?.signature === signature) {
    return structuredClone(cached.result)
  }
  const hash = createHash('sha256')
  let lineParts: Buffer[] = []
  let lineBytes = 0
  let lineOversized = false
  let consumedBytes = 0
  let sessionId: string | null = null
  let cwd: string | null = null
  let worker = false
  let checkpoint: ConversationContinuationCheckpoint | null = null
  let checkpointByteOffset: number | null = null
  let frontierReliable = true
  let turnId: string | null = null
  let turnState: InspectedCodexContextSource['turnState'] = null
  let userMessageCount = 0
  let activityReliable = true
  let turnContext: RecordValue | null = null
  let sessionMeta: RecordValue | null = null

  const consumeLine = (lineWithNewline: Buffer | null): void => {
    if (!lineWithNewline) {
      frontierReliable = false
      activityReliable = false
      return
    }
    const lineEnd =
      lineWithNewline.length >= 2 && lineWithNewline.at(-2) === 0x0d
        ? lineWithNewline.length - 2
        : lineWithNewline.length - 1
    const parsed = parseLine(lineWithNewline.subarray(0, lineEnd))
    const payload = record(parsed?.payload)
    if (!parsed || !payload) {
      frontierReliable = false
      activityReliable = false
      return
    }
    if (parsed.type === 'session_meta') {
      sessionMeta = payload
      sessionId =
        string(payload.id) ?? string(payload.session_id) ?? string(payload.thread_id) ?? sessionId
      cwd = string(payload.cwd) ?? cwd
      worker ||= isCodexWorkerSession(payload)
      return
    }
    if (parsed.type === 'turn_context') {
      turnContext = payload
      turnId = string(payload.turn_id) ?? turnId
      cwd = string(payload.cwd) ?? cwd
      return
    }
    if (
      (parsed.type === 'response_item' && payload.type === 'message' && payload.role === 'user') ||
      (parsed.type === 'event_msg' && payload.type === 'user_message')
    ) {
      userMessageCount++
    }
    if (parsed.type === 'event_msg') {
      if (payload.type === 'task_started') {
        turnId = string(payload.turn_id) ?? string(payload.turnId)
        turnState = 'running'
        activityReliable = true
      } else if (payload.type === 'turn_aborted') {
        turnState = 'interrupted'
      }
    }
    if (parsed.type !== 'event_msg' || payload.type !== 'task_complete') {
      if (!(parsed.type === 'event_msg' && payload.type === 'token_count')) {
        frontierReliable = false
      }
      return
    }
    const lastTurnId = string(payload.turn_id) ?? string(payload.turnId)
    const completedAt = timestamp(payload.completed_at) ?? timestamp(parsed.timestamp)
    if (!lastTurnId || !completedAt) {
      return
    }
    turnId = lastTurnId
    turnState = 'completed'
    checkpoint = { lastTurnId, completedAt, revision: copyRevision(hash) }
    checkpointByteOffset = consumedBytes
    frontierReliable = true
  }

  const stream = openTranscriptReadStream(realTranscriptPath, {}, 'exact')
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let offset = 0
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset)
      const end = newline === -1 ? chunk.length : newline + 1
      const part = chunk.subarray(offset, end)
      hash.update(part)
      consumedBytes += part.byteLength
      lineBytes += part.byteLength
      if (!lineOversized && lineBytes <= MAX_INSPECTED_LINE_BYTES + 2) {
        lineParts.push(Buffer.from(part))
      } else {
        lineOversized = true
        lineParts = []
      }
      if (newline === -1) {
        break
      }
      consumeLine(lineOversized ? null : Buffer.concat(lineParts, lineBytes))
      lineParts = []
      lineBytes = 0
      lineOversized = false
      offset = end
    }
  }
  if (lineBytes > 0) {
    frontierReliable = false
    activityReliable = false
  }
  assertSourceIdentity({ source, sessionId, cwd, worker })
  const result = {
    checkpoint: frontierReliable ? checkpoint : null,
    checkpointByteOffset: frontierReliable ? checkpointByteOffset : null,
    turnId,
    turnState,
    userMessageCount,
    activityReliable,
    turnContext,
    sessionMeta
  }
  inspectionCache.set(cacheKey, { signature, result })
  if (inspectionCache.size > 64) {
    inspectionCache.delete(inspectionCache.keys().next().value!)
  }
  return structuredClone(result)
}

export { writeCodexContinuationReference } from './codex-continuation-reference'
