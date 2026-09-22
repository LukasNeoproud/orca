import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  PortableConversationProposalNotice,
  PortableConversationProposalPreference,
  PortableConversationProposalRecord
} from '../../shared/portable-conversation-proposal'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'

const FILE_NAME = 'portable-conversation-proposals.json'

type State = {
  schemaVersion: 1
  proposals: PortableConversationProposalRecord[]
  notices: PortableConversationProposalNotice[]
  preferences: Record<string, boolean>
}

function emptyState(): State {
  return { schemaVersion: 1, proposals: [], notices: [], preferences: {} }
}

function validRecord(value: unknown): value is PortableConversationProposalRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<PortableConversationProposalRecord>
  return (
    record.schemaVersion === 1 &&
    !!record.proposal &&
    typeof record.proposal.proposalId === 'string' &&
    Array.isArray(record.proposal.items) &&
    Number.isSafeInteger(record.revision) &&
    (record.revision ?? 0) > 0 &&
    ['offered', 'dismissed', 'confirmed'].includes(record.state ?? '') &&
    Array.isArray(record.results) &&
    !!record.portable?.source?.executionHostId?.startsWith('ssh:')
  )
}

function validNotice(value: unknown): value is PortableConversationProposalNotice {
  if (!value || typeof value !== 'object') {
    return false
  }
  const notice = value as Partial<PortableConversationProposalNotice>
  return (
    notice.schemaVersion === 1 &&
    typeof notice.noticeId === 'string' &&
    typeof notice.proposalId === 'string' &&
    typeof notice.content === 'string' &&
    Array.isArray(notice.branchIds) &&
    !!notice.source?.executionHostId?.startsWith('ssh:')
  )
}

async function load(filePath: string): Promise<State> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyState()
    }
    throw error
  }
  const state = parsed as Partial<State>
  if (
    state.schemaVersion !== 1 ||
    !Array.isArray(state.proposals) ||
    !state.proposals.every(validRecord) ||
    !Array.isArray(state.notices) ||
    !state.notices.every(validNotice) ||
    !state.preferences ||
    typeof state.preferences !== 'object'
  ) {
    throw new Error('portable_conversation_proposal_store_corrupt')
  }
  return state as State
}

export class PortableConversationProposalStore {
  private queue = Promise.resolve()
  private readonly exclusive = new Map<string, Promise<unknown>>()

  private constructor(
    private readonly filePath: string,
    private readonly state: State
  ) {}

  static async open(directory: string): Promise<PortableConversationProposalStore> {
    const filePath = join(directory, FILE_NAME)
    return new PortableConversationProposalStore(filePath, await load(filePath))
  }

  get(proposalId: string): PortableConversationProposalRecord | null {
    return this.state.proposals.find((record) => record.proposal.proposalId === proposalId) ?? null
  }

  forSession(sessionId: string, proposalId?: string): PortableConversationProposalRecord | null {
    return (
      this.state.proposals
        .filter(
          (record) =>
            record.proposal.source.sessionId === sessionId &&
            (!proposalId || record.proposal.proposalId === proposalId)
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
    )
  }

  put(
    record: PortableConversationProposalRecord,
    expectedRevision: number
  ): Promise<PortableConversationProposalRecord> {
    return this.transact(async () => {
      const index = this.state.proposals.findIndex(
        (item) => item.proposal.proposalId === record.proposal.proposalId
      )
      const current = index === -1 ? null : this.state.proposals[index]!
      if (
        (current?.revision ?? 0) !== expectedRevision ||
        record.revision !== expectedRevision + 1
      ) {
        throw new Error('portable_conversation_proposal_stale')
      }
      if (current?.state === 'confirmed') {
        if (JSON.stringify(current) === JSON.stringify(record)) {
          return current
        }
        throw new Error('portable_conversation_proposal_immutable')
      }
      if (index === -1) {
        this.state.proposals.push(record)
      } else {
        this.state.proposals[index] = record
      }
      await this.persist()
      return record
    })
  }

  replace(record: PortableConversationProposalRecord): Promise<PortableConversationProposalRecord> {
    return this.transact(async () => {
      const index = this.state.proposals.findIndex(
        (item) => item.proposal.proposalId === record.proposal.proposalId
      )
      if (index === -1) {
        throw new Error('portable_conversation_proposal_missing')
      }
      this.state.proposals[index] = record
      await this.persist()
      return record
    })
  }

  preference(sessionId: string, workspaceId: string): PortableConversationProposalPreference {
    const keys = [
      [`session:${sessionId}`, 'session'],
      [`workspace:${workspaceId}`, 'workspace'],
      ['global', 'global']
    ] as const
    for (const [key, source] of keys) {
      const enabled = this.state.preferences[key]
      if (typeof enabled === 'boolean') {
        return { enabled, source }
      }
    }
    return { enabled: true, source: 'default' }
  }

  setPreference(
    scope: 'session' | 'workspace' | 'global',
    sessionId: string,
    workspaceId: string,
    enabled: boolean
  ): Promise<void> {
    const key =
      scope === 'session'
        ? `session:${sessionId}`
        : scope === 'workspace'
          ? `workspace:${workspaceId}`
          : 'global'
    return this.transact(async () => {
      this.state.preferences[key] = enabled
      await this.persist()
    })
  }

  getNotice(noticeId: string): PortableConversationProposalNotice | null {
    return this.state.notices.find((notice) => notice.noticeId === noticeId) ?? null
  }

  notices(proposalId: string): PortableConversationProposalNotice[] {
    return this.state.notices.filter((notice) => notice.proposalId === proposalId)
  }

  putNotice(
    notice: PortableConversationProposalNotice
  ): Promise<PortableConversationProposalNotice> {
    return this.transact(async () => {
      const index = this.state.notices.findIndex((item) => item.noticeId === notice.noticeId)
      if (index === -1) {
        this.state.notices.push(notice)
      } else {
        this.state.notices[index] = notice
      }
      await this.persist()
      return notice
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
