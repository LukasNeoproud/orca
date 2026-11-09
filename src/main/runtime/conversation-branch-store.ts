// The host's record of which Claude conversation was branched from which, and where. One small
// JSON file in the host state directory: branches are few, and every write is a whole snapshot.

import { mkdir, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isConversationBranchRecord,
  type ConversationBranchRecord,
  type ConversationBranchReturn
} from '../../shared/conversation-branch'
import { writeFileDurable } from '../durable-file-write'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'

const FILE_NAME = 'conversation-branches.json'
// Oldest are dropped past this; a family that old has long been navigated away from.
const MAX_BRANCHES = 2_000

type StoreFile = { schemaVersion: 1; branches: ConversationBranchRecord[] }

export type ConversationBranchStoreLogger = Pick<StructuredAgentSessionLogger, 'warn'>

export class ConversationBranchStore {
  private readonly filePath: string
  private branches: ConversationBranchRecord[] | null = null
  private writes: Promise<void> = Promise.resolve()

  constructor(
    private readonly stateDirectory: string,
    private readonly logger: ConversationBranchStoreLogger
  ) {
    this.filePath = join(stateDirectory, FILE_NAME)
  }

  private async load(): Promise<ConversationBranchRecord[]> {
    if (this.branches) {
      return this.branches
    }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(await readFile(this.filePath, 'utf8'))
    } catch (error) {
      const missing =
        !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
      if (!missing) {
        await this.quarantine(error)
      }
    }
    const branches =
      parsed && typeof parsed === 'object' && 'branches' in parsed && Array.isArray(parsed.branches)
        ? parsed.branches
        : []
    // A record a newer build wrote that this one cannot read is skipped, not fatal.
    this.branches = branches.filter(isConversationBranchRecord)
    return this.branches
  }

  // An unreadable file is kept aside rather than overwritten, so lineage can still be recovered.
  private async quarantine(error: unknown): Promise<void> {
    this.logger.warn('conversation branch store is unreadable; starting empty', {
      scope: 'conversation-branch-store-load',
      error
    })
    await rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`).catch(() => {})
  }

  private persist(branches: ConversationBranchRecord[]): Promise<void> {
    this.branches = branches
    const snapshot: StoreFile = { schemaVersion: 1, branches }
    const write = this.writes.then(async () => {
      await mkdir(this.stateDirectory, { recursive: true })
      await writeFileDurable(`${this.filePath}.tmp`, this.filePath, JSON.stringify(snapshot))
    })
    this.writes = write.catch(() => {})
    return write
  }

  async list(workspaceId: string): Promise<ConversationBranchRecord[]> {
    return (await this.load()).filter((branch) => branch.workspaceId === workspaceId)
  }

  async get(branchId: string): Promise<ConversationBranchRecord | null> {
    return (await this.load()).find((branch) => branch.branchId === branchId) ?? null
  }

  async findByRequest(requestId: string): Promise<ConversationBranchRecord | null> {
    return (await this.load()).find((branch) => branch.requestId === requestId) ?? null
  }

  async put(record: ConversationBranchRecord): Promise<ConversationBranchRecord> {
    const others = (await this.load()).filter((branch) => branch.branchId !== record.branchId)
    await this.persist([...others, record].slice(-MAX_BRANCHES))
    return record
  }

  async appendReturn(
    branchId: string,
    entry: ConversationBranchReturn
  ): Promise<ConversationBranchRecord> {
    const branch = await this.get(branchId)
    if (!branch) {
      throw new Error('conversation_branch_not_found')
    }
    // Idempotent: a retried delivery of the same return is not a second one.
    if (branch.returns.some((existing) => existing.returnId === entry.returnId)) {
      return branch
    }
    return await this.put({
      ...branch,
      returns: [...branch.returns, entry].slice(-100),
      updatedAt: entry.createdAt
    })
  }
}
