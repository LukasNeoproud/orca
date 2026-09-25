import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConversationContinuationCandidate } from '../../shared/conversation-continuation'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'

const STORE_FILE_NAME = 'conversation-continuation-candidates.json'
const STORE_SCHEMA_VERSION = 1

type PersistedState = {
  schemaVersion: 1
  candidates: ConversationContinuationCandidate[]
}

function isCandidate(value: unknown): value is ConversationContinuationCandidate {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<ConversationContinuationCandidate>
  return (
    typeof candidate.candidateId === 'string' &&
    typeof candidate.source?.providerSessionId === 'string' &&
    typeof candidate.source.workspaceId === 'string' &&
    typeof candidate.checkpoint?.lastTurnId === 'string' &&
    typeof candidate.checkpoint.completedAt === 'string' &&
    typeof candidate.checkpoint.revision === 'string' &&
    typeof candidate.status === 'string' &&
    ['preparing', 'ready', 'unconfirmed', 'failed', 'stale', 'used'].includes(candidate.status) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.compactionOrigin === undefined ||
      candidate.compactionOrigin === 'automatic' ||
      candidate.compactionOrigin === 'manual') &&
    (candidate.mode === undefined || candidate.mode === 'fresh') &&
    (candidate.mode !== 'fresh' ||
      (typeof candidate.handoffDigest === 'string' &&
        /^[a-f0-9]{64}$/.test(candidate.handoffDigest)))
  )
}

function clone(candidate: ConversationContinuationCandidate): ConversationContinuationCandidate {
  return structuredClone(candidate)
}

export class CodexContinuationStore {
  private readonly filePath: string
  private readonly candidates = new Map<string, ConversationContinuationCandidate>()
  private writeQueue = Promise.resolve()
  private readonly recoveryWrite: Promise<void>

  constructor(userDataPath: string, now: () => number = Date.now) {
    this.filePath = join(userDataPath, STORE_FILE_NAME)
    const recoveredAt = new Date(now()).toISOString()
    let recovered = false
    for (const candidate of this.load()) {
      if (candidate.status === 'stale') {
        recovered = true
        continue
      }
      if (candidate.status === 'preparing') {
        candidate.status = 'unconfirmed'
        candidate.error = 'Preparation outcome is unknown because Orca restarted.'
        candidate.updatedAt = recoveredAt
        recovered = true
      }
      this.candidates.set(candidate.candidateId, candidate)
    }
    this.recoveryWrite = recovered ? this.queueWrite() : Promise.resolve()
    void this.recoveryWrite.catch((error) =>
      console.error('Could not persist recovered Codex continuation state', error)
    )
  }

  get(candidateId: string): ConversationContinuationCandidate | null {
    const candidate = this.candidates.get(candidateId)
    return candidate ? clone(candidate) : null
  }

  all(): ConversationContinuationCandidate[] {
    return [...this.candidates.values()].map(clone)
  }

  findCheckpoint(
    providerSessionId: string,
    workspaceId: string,
    revision: string,
    handoffDigest?: string
  ): ConversationContinuationCandidate | null {
    const candidate = [...this.candidates.values()].find(
      (entry) =>
        entry.source.providerSessionId === providerSessionId &&
        entry.source.workspaceId === workspaceId &&
        entry.checkpoint.revision === revision &&
        (handoffDigest
          ? entry.mode === 'fresh' && entry.handoffDigest === handoffDigest
          : entry.mode !== 'fresh')
    )
    return candidate ? clone(candidate) : null
  }

  async put(candidate: ConversationContinuationCandidate): Promise<void> {
    if (!this.candidates.has(candidate.candidateId) && this.candidates.size >= 512) {
      throw new Error('conversation_continuation_candidate_store_full')
    }
    this.candidates.set(candidate.candidateId, clone(candidate))
    await this.queueWrite()
  }

  async update(
    candidateId: string,
    update: (candidate: ConversationContinuationCandidate) => ConversationContinuationCandidate
  ): Promise<ConversationContinuationCandidate | null> {
    const current = this.candidates.get(candidateId)
    if (!current) {
      return null
    }
    const next = update(clone(current))
    this.candidates.set(candidateId, clone(next))
    await this.queueWrite()
    return clone(next)
  }

  async pruneOtherRevisions(
    providerSessionId: string,
    workspaceId: string,
    revision: string
  ): Promise<void> {
    let changed = false
    for (const [candidateId, candidate] of this.candidates) {
      if (
        candidate.source.providerSessionId !== providerSessionId ||
        candidate.source.workspaceId !== workspaceId ||
        candidate.checkpoint.revision === revision ||
        candidate.status === 'preparing'
      ) {
        continue
      }
      // The newer checkpoint makes this record ineligible for claim or retry.
      this.candidates.delete(candidateId)
      changed = true
    }
    if (changed) {
      await this.queueWrite()
    }
  }

  async settled(): Promise<void> {
    await this.recoveryWrite
    await this.writeQueue
  }

  private load(): ConversationContinuationCandidate[] {
    if (!existsSync(this.filePath)) {
      return []
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch (error) {
      throw new Error(`Could not read Codex continuation state at ${this.filePath}`, {
        cause: error
      })
    }
    const state = parsed as Partial<PersistedState>
    if (
      state.schemaVersion !== STORE_SCHEMA_VERSION ||
      !Array.isArray(state.candidates) ||
      !state.candidates.every(isCandidate)
    ) {
      throw new Error(`Codex continuation state at ${this.filePath} has an unsupported shape`)
    }
    return state.candidates.map(clone)
  }

  private queueWrite(): Promise<void> {
    const payload = JSON.stringify(
      {
        schemaVersion: STORE_SCHEMA_VERSION,
        candidates: [...this.candidates.values()]
      } satisfies PersistedState,
      null,
      2
    )
    const write = this.writeQueue.then(() =>
      writeFileDurable(durableWriteTempPath(this.filePath), this.filePath, `${payload}\n`)
    )
    this.writeQueue = write.catch(() => undefined)
    return write
  }
}
