// Prepares a branch of a Claude conversation on the host that holds its transcript. Preparing never
// sends the branch a prompt: the client opens it with an unsent draft. The record is saved before
// the provider fork, so a fork whose outcome is unknown is remembered and never repeated.

import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { AgentJournalSnapshot } from '../../shared/agent-session-journal-types'
import type {
  ConversationBranchOutline,
  ConversationBranchRecord
} from '../../shared/conversation-branch'
import type {
  ConversationBranchPrepareParams,
  ConversationBranchRecordReturnParams
} from '../../shared/rpc-contract/conversation-branch-params'
import type { ClaudeCompactForkInput } from '../claude/claude-conversation-compact-fork'
import type { ClaudeConversationForkJob } from '../claude/claude-conversation-fork-worker'
import {
  readClaudeTranscriptTurns,
  resolveClaudeTranscriptTurn
} from '../claude/claude-transcript-turns'
import { resolveConversationBranchChatAnchor } from './conversation-branch-chat-anchor'
import type { ConversationBranchStore } from './conversation-branch-store'

type PrepareParams = z.infer<typeof ConversationBranchPrepareParams>
type RecordReturnParams = z.infer<typeof ConversationBranchRecordReturnParams>

export type ConversationBranchChatFacts = {
  workspaceId: string
  accountHomePath: string
  /** The agent is working or waiting on the person: its newest turn is not a fork point yet. */
  busy: boolean
}

export type ConversationBranchTranscript = { path: string; accountHomePath: string }

export type ConversationBranchServiceDeps = {
  hostId: string
  store: ConversationBranchStore
  resolveWorkspacePath: (workspaceId: string) => Promise<string>
  readChat: (sessionId: string) => ConversationBranchChatFacts | null
  readChatJournal: (
    sessionId: string
  ) => Promise<Pick<AgentJournalSnapshot, 'items' | 'submissions'>>
  /** The Claude id a chat that has not launched yet will run under. */
  chatProviderSessionId: (sessionId: string) => string | null
  findTranscript: (
    providerSessionId: string,
    preferredAccountHomePath?: string
  ) => Promise<ConversationBranchTranscript | null>
  forkFull: (job: ClaudeConversationForkJob, accountHomePath: string) => Promise<string>
  forkCompacted: (
    input: Omit<ClaudeCompactForkInput, 'command' | 'env'>,
    accountHomePath: string
  ) => Promise<void>
  newId?: () => string
  now?: () => number
}

type Source = {
  providerSessionId: string
  promptUuid: string
  structuredSessionId?: string
  turnItemId?: string
  preferredAccountHomePath?: string
}

export class ConversationBranchService {
  private readonly newId: () => string
  private readonly now: () => number
  // One prepare per request at a time: a client retry must find the first one's record.
  private readonly inFlight = new Map<string, Promise<ConversationBranchRecord>>()

  constructor(private readonly deps: ConversationBranchServiceDeps) {
    this.newId = deps.newId ?? randomUUID
    this.now = deps.now ?? Date.now
  }

  list(workspaceId: string): Promise<ConversationBranchRecord[]> {
    return this.deps.store.list(workspaceId)
  }

  async outline(providerSessionId: string): Promise<ConversationBranchOutline> {
    const transcript = await this.deps.findTranscript(providerSessionId)
    if (!transcript) {
      throw new Error('conversation_branch_history_missing')
    }
    const { turns } = await readClaudeTranscriptTurns(transcript.path)
    return {
      turns: turns.map(({ promptUuid, prompt, reply }) => ({ promptUuid, prompt, reply }))
    }
  }

  recordReturn(params: RecordReturnParams): Promise<ConversationBranchRecord> {
    return this.deps.store.appendReturn(params.branchId, {
      returnId: params.returnId,
      content: params.content,
      createdAt: this.now()
    })
  }

  prepare(params: PrepareParams): Promise<ConversationBranchRecord> {
    const pending = this.inFlight.get(params.requestId)
    if (pending) {
      return pending
    }
    const run = this.prepareOnce(params).finally(() => this.inFlight.delete(params.requestId))
    this.inFlight.set(params.requestId, run)
    return run
  }

  private async prepareOnce(params: PrepareParams): Promise<ConversationBranchRecord> {
    const existing = await this.deps.store.findByRequest(params.requestId)
    if (existing) {
      return existing
    }
    const source = await this.resolveSource(params)
    const transcript = await this.deps.findTranscript(
      source.providerSessionId,
      source.preferredAccountHomePath
    )
    if (!transcript) {
      throw new Error('conversation_branch_history_missing')
    }
    const { turn, cwd } = await resolveClaudeTranscriptTurn(transcript.path, source.promptUuid)
    const createdAt = this.now()
    const base: ConversationBranchRecord = {
      schemaVersion: 1,
      branchId: this.newId(),
      requestId: params.requestId,
      workspaceId: params.worktreeId,
      executionHostId: this.deps.hostId,
      agent: 'claude',
      parent: {
        providerSessionId: source.providerSessionId,
        ...(source.structuredSessionId ? { structuredSessionId: source.structuredSessionId } : {}),
        ...(source.turnItemId ? { turnItemId: source.turnItemId } : {}),
        promptUuid: turn.promptUuid,
        boundaryUuid: turn.boundaryUuid,
        excerpt: turn.reply || turn.prompt
      },
      child: { providerSessionId: null, surface: params.surface },
      mode: params.mode,
      label: params.label,
      ...(params.focus ? { focus: params.focus } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      state: 'forking',
      returns: [],
      createdAt,
      updatedAt: createdAt
    }
    if (params.mode === 'clean') {
      return await this.deps.store.put({
        ...base,
        child: { providerSessionId: this.cleanChildId(params), surface: params.surface },
        state: 'prepared'
      })
    }
    if (params.mode === 'full') {
      await this.deps.store.put(base)
      return await this.settle(base, async () =>
        this.deps.forkFull(
          {
            sourceSessionId: source.providerSessionId,
            upToUuid: turn.boundaryUuid,
            title: params.label
          },
          transcript.accountHomePath
        )
      )
    }
    const targetSessionId = this.newId()
    const compacting: ConversationBranchRecord = {
      ...base,
      child: { providerSessionId: targetSessionId, surface: params.surface }
    }
    await this.deps.store.put(compacting)
    return await this.settle(compacting, async () => {
      await this.deps.forkCompacted(
        {
          cwd: cwd ?? (await this.deps.resolveWorkspacePath(params.worktreeId)),
          sourceSessionId: source.providerSessionId,
          boundaryUuid: turn.boundaryUuid,
          targetSessionId,
          focus: params.focus ?? ''
        },
        transcript.accountHomePath
      )
      return targetSessionId
    })
  }

  private async resolveSource(params: PrepareParams): Promise<Source> {
    if (params.source.kind === 'transcript') {
      return {
        providerSessionId: params.source.providerSessionId,
        promptUuid: params.source.promptUuid
      }
    }
    const { sessionId, itemId } = params.source
    const chat = this.deps.readChat(sessionId)
    if (!chat || chat.workspaceId !== params.worktreeId) {
      throw new Error('conversation_branch_workspace_mismatch')
    }
    if (chat.busy) {
      throw new Error('conversation_branch_source_busy')
    }
    const anchor = resolveConversationBranchChatAnchor(
      await this.deps.readChatJournal(sessionId),
      itemId
    )
    return {
      ...anchor,
      structuredSessionId: sessionId,
      preferredAccountHomePath: chat.accountHomePath
    }
  }

  private cleanChildId(params: PrepareParams): string {
    if (params.surface === 'terminal') {
      return this.newId()
    }
    const id = params.childStructuredSessionId
      ? this.deps.chatProviderSessionId(params.childStructuredSessionId)
      : null
    if (!id) {
      throw new Error('conversation_branch_invalid_anchor')
    }
    return id
  }

  // A failure after Claude may have written the child is unverified, never a clean failure.
  private async settle(
    record: ConversationBranchRecord,
    fork: () => Promise<string>
  ): Promise<ConversationBranchRecord> {
    try {
      const childId = await fork()
      return await this.deps.store.put({
        ...record,
        child: { ...record.child, providerSessionId: childId },
        state: 'prepared',
        updatedAt: this.now()
      })
    } catch (error) {
      const childId = record.child.providerSessionId
      const written = childId ? await this.deps.findTranscript(childId) : null
      const message = error instanceof Error ? error.message : String(error)
      await this.deps.store.put({
        ...record,
        state: written ? 'fork-unverified' : 'failed',
        error: message.slice(0, 512),
        updatedAt: this.now()
      })
      throw new Error(written ? 'conversation_branch_fork_unverified' : message.slice(0, 512), {
        cause: error
      })
    }
  }
}
