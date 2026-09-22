import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConversationContinuationSource } from '../../shared/conversation-continuation'
import type { ConversationContinuationView } from '../../shared/conversation-continuation-view'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'
import type { CodexContinuationService } from '../codex/codex-continuation-service'

type Registration = {
  source: ConversationContinuationSource
  candidateId: string | null
  touchedAt: number
}
type Dependencies = {
  directory: string
  service: CodexContinuationService
  settings: () => Pick<
    GlobalSettings,
    'conversationContinuationAutoCompact' | 'conversationContinuationCompactAfterMs'
  >
  busy: (providerSessionId: string) => boolean
  now?: () => number
}
const keyOf = (source: ConversationContinuationSource) =>
  JSON.stringify([source.workspaceId, source.providerSessionId])

export class ConversationContinuationScheduler {
  private readonly registrations = new Map<string, Registration>()
  private timer: ReturnType<typeof setInterval> | undefined
  private writes = Promise.resolve()
  private ticking = false
  private readonly ready: Promise<void>

  constructor(private readonly deps: Dependencies) {
    this.ready = this.load()
  }

  private get filePath(): string {
    return join(this.deps.directory, 'continuation-schedule.json')
  }
  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private async load(): Promise<void> {
    try {
      const rows: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!Array.isArray(rows) || rows.length > 256) {
        throw new Error('Invalid continuation schedule')
      }
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          throw new Error('Invalid continuation registration')
        }
        const value = row as Registration
        if (
          typeof value.source?.workspaceId !== 'string' ||
          typeof value.source.providerSessionId !== 'string' ||
          !Number.isFinite(value.touchedAt) ||
          !(value.candidateId === null || typeof value.candidateId === 'string')
        ) {
          throw new Error('Invalid continuation registration')
        }
        this.registrations.set(keyOf(value.source), value)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    this.timer = setInterval(() => void this.tick(), 30_000)
    this.timer.unref()
  }

  private persist(): Promise<void> {
    const text = JSON.stringify([...this.registrations.values()])
    const write = async () => {
      await mkdir(this.deps.directory, { recursive: true })
      const temporary = durableWriteTempPath(this.filePath)
      await writeTempFileDurable(temporary, text)
      await renameDurable(temporary, this.filePath)
    }
    this.writes = this.writes.then(write, write)
    return this.writes
  }

  async inspect(source: ConversationContinuationSource): Promise<ConversationContinuationView> {
    await this.ready
    const inspection = await this.deps.service.inspect(source)
    const key = keyOf(source)
    let registration = this.registrations.get(key)
    if (!registration) {
      if (this.registrations.size >= 256) {
        const oldest = [...this.registrations.entries()].sort(
          (a, b) => a[1].touchedAt - b[1].touchedAt
        )[0]
        this.registrations.delete(oldest[0])
      }
      registration = { source: inspection.source, candidateId: null, touchedAt: this.now() }
      this.registrations.set(key, registration)
      await this.persist()
    }
    const busy = this.deps.busy(source.providerSessionId)
    const candidate = registration.candidateId
      ? this.deps.service.status(registration.candidateId)
      : null
    return {
      ...inspection,
      checkpoint: busy ? null : inspection.checkpoint,
      candidate:
        candidate && candidate.checkpoint.revision !== inspection.checkpoint?.revision
          ? { ...candidate, status: 'stale' }
          : candidate,
      autoCompact: this.deps.settings().conversationContinuationAutoCompact === true
    }
  }

  async prepare(source: ConversationContinuationSource, expectedRevision: string) {
    await this.ready
    if (this.deps.busy(source.providerSessionId)) {
      throw new Error('The conversation is still working or awaiting input.')
    }
    const view = await this.inspect(source)
    if (view.checkpoint?.revision !== expectedRevision) {
      throw new Error('The conversation changed. Refresh before preparing a copy.')
    }
    const candidate = await this.deps.service.prepareInBackground({ source, expectedRevision })
    const registration = this.registrations.get(keyOf(source))!
    registration.candidateId = candidate.candidateId
    registration.touchedAt = this.now()
    await this.persist()
    return candidate
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      return
    }
    this.ticking = true
    try {
      await this.ready
      const settings = this.deps.settings()
      if (settings.conversationContinuationAutoCompact !== true) {
        return
      }
      const delay = settings.conversationContinuationCompactAfterMs ?? 1_800_000
      if (!Number.isFinite(delay) || delay < 60_000) {
        return
      }
      if (
        [...this.registrations.values()].some(
          (entry) =>
            entry.candidateId && this.deps.service.status(entry.candidateId)?.status === 'preparing'
        )
      ) {
        return
      }
      for (const { source } of this.registrations.values()) {
        try {
          if (this.deps.settings().conversationContinuationAutoCompact !== true) {
            break
          }
          const view = await this.inspect(source)
          if (!view.checkpoint || this.now() - Date.parse(view.checkpoint.completedAt) < delay) {
            continue
          }
          if (view.candidate?.checkpoint.revision === view.checkpoint.revision) {
            continue
          }
          await this.prepare(source, view.checkpoint.revision)
          break
        } catch (error) {
          console.warn('[conversation-continuation] Preparation deferred', {
            source,
            error: String(error)
          })
        }
      }
    } finally {
      this.ticking = false
    }
  }

  dispose(): void {
    clearInterval(this.timer)
  }
}
