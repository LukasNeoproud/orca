import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { StructuredTopicIndex } from '../../shared/structured-topic-index'
import {
  isPortableConversationTopicIndexRecord,
  type PortableConversationTopicIndexRecord
} from '../../shared/portable-conversation-topic-index'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'

const FILE_NAME = 'portable-conversation-topic-index.json'

type State = {
  schemaVersion: 1
  records: PortableConversationTopicIndexRecord[]
}

async function load(filePath: string): Promise<State> {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as Partial<State>
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.records) ||
      !value.records.every(isPortableConversationTopicIndexRecord)
    ) {
      throw new Error('portable_conversation_topic_index_store_corrupt')
    }
    return value as State
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: 1, records: [] }
    }
    throw error
  }
}

export class PortableConversationTopicIndexStore {
  private queue = Promise.resolve()
  private readonly exclusive = new Map<string, Promise<unknown>>()

  private constructor(
    private readonly filePath: string,
    private readonly state: State
  ) {}

  static async open(directory: string): Promise<PortableConversationTopicIndexStore> {
    const filePath = join(directory, FILE_NAME)
    return new PortableConversationTopicIndexStore(filePath, await load(filePath))
  }

  get(sessionId: string): PortableConversationTopicIndexRecord | null {
    return this.state.records.find((record) => record.sessionId === sessionId) ?? null
  }

  put(record: PortableConversationTopicIndexRecord): Promise<PortableConversationTopicIndexRecord> {
    return this.transact(async () => {
      const index = this.state.records.findIndex((item) => item.sessionId === record.sessionId)
      if (index === -1) {
        this.state.records.push(record)
      } else {
        this.state.records[index] = record
      }
      await this.persist()
      return record
    })
  }

  writeIndex(
    sessionId: string,
    index: StructuredTopicIndex,
    expectedRevision: number,
    now = Date.now()
  ): Promise<PortableConversationTopicIndexRecord> {
    return this.runExclusive(sessionId, async () => {
      const current = this.get(sessionId)
      if (!current) {
        throw new Error('portable_conversation_topic_index_missing')
      }
      if (current.index.revision !== expectedRevision) {
        throw new Error('portable_conversation_topic_index_stale')
      }
      if (index.sessionId !== sessionId || index.revision !== expectedRevision + 1) {
        throw new Error('portable_conversation_topic_index_invalid')
      }
      return this.put({ ...current, index, updatedAt: now })
    })
  }

  runExclusive<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.exclusive.get(key) ?? Promise.resolve()
    const next = previous.then(run, run)
    this.exclusive.set(key, next)
    void next
      .finally(() => {
        if (this.exclusive.get(key) === next) {
          this.exclusive.delete(key)
        }
      })
      .catch(() => {})
    return next
  }

  private transact<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    await chmod(dirname(this.filePath), 0o700)
    const temp = durableWriteTempPath(this.filePath)
    try {
      await writeTempFileDurable(temp, JSON.stringify(this.state), 0o600)
      await renameDurable(temp, this.filePath)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }
}
