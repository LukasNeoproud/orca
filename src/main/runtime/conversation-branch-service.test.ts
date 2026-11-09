import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_JOURNAL_THREAD_SCOPE,
  type AgentJournalRenderItem
} from '../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import {
  ConversationBranchService,
  type ConversationBranchServiceDeps
} from './conversation-branch-service'
import { ConversationBranchStore } from './conversation-branch-store'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const PARENT = 'parent-session'

function transcriptFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'conversation-branch-service-'))
  roots.push(root)
  const path = join(root, `${PARENT}.jsonl`)
  const rows = [
    { type: 'user', uuid: 'p1', parentUuid: null, cwd: '/work', message: { content: 'Review' } },
    {
      type: 'assistant',
      uuid: 'a1',
      parentUuid: 'p1',
      message: { content: [{ type: 'text', text: 'Found two issues' }] }
    },
    { type: 'attachment', uuid: 'x1', parentUuid: 'a1' },
    { type: 'user', uuid: 'p2', parentUuid: 'x1', message: { content: 'Fix one' } },
    {
      type: 'assistant',
      uuid: 'a2',
      parentUuid: 'p2',
      message: { content: [{ type: 'text', text: 'Fixed' }] }
    }
  ]
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n'))
  return path
}

function journalItem(sequence: number, role: 'user' | 'assistant', uuid: string, text: string) {
  return {
    itemId: agentJournalItemKey({ provider: 'claude', sessionId: PARENT, uuid }),
    revision: 1,
    sequence,
    observedAt: sequence,
    body: { kind: 'message', role, blocks: [{ type: 'text', text }] }
  } satisfies AgentJournalRenderItem
}

function service(overrides: Partial<ConversationBranchServiceDeps> = {}) {
  const transcriptPath = transcriptFile()
  const ids = ['branch-a', 'child-a', 'branch-b', 'child-b', 'branch-c', 'child-c']
  const deps: ConversationBranchServiceDeps = {
    hostId: 'local',
    store: new ConversationBranchStore(join(transcriptPath, '..', 'state'), { warn: vi.fn() }),
    resolveWorkspacePath: async () => '/work',
    readChat: () => ({ workspaceId: 'wt-1', accountHomePath: '/home/.claude', busy: false }),
    readChatJournal: async () => ({
      items: [
        journalItem(1, 'user', 'p1', 'Review'),
        journalItem(2, 'assistant', 'a1', 'Found two issues'),
        journalItem(3, 'user', 'p2', 'Fix one'),
        journalItem(4, 'assistant', 'a2', 'Fixed')
      ],
      submissions: []
    }),
    chatProviderSessionId: (sessionId) => `claude-of-${sessionId}`,
    findTranscript: async (id) =>
      id === PARENT ? { path: transcriptPath, accountHomePath: '/home/.claude' } : null,
    forkFull: vi.fn(async () => 'forked-child'),
    forkCompacted: vi.fn(async () => {}),
    newId: () => ids.shift() ?? 'extra',
    now: () => 100,
    ...overrides
  }
  return { branches: new ConversationBranchService(deps), deps }
}

const transcriptSource = {
  kind: 'transcript',
  providerSessionId: PARENT,
  promptUuid: 'p1'
} as const

describe('ConversationBranchService.prepare', () => {
  it('forks a full branch at the end of the chosen turn and answers a retry with the same branch', async () => {
    const { branches, deps } = service()
    const params = {
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'full',
      surface: 'terminal',
      label: 'Finding 1'
    } as const
    const [first, concurrent] = await Promise.all([
      branches.prepare(params),
      branches.prepare(params)
    ])
    const retried = await branches.prepare(params)

    expect(deps.forkFull).toHaveBeenCalledOnce()
    expect(deps.forkFull).toHaveBeenCalledWith(
      { sourceSessionId: PARENT, upToUuid: 'x1', title: 'Finding 1' },
      '/home/.claude'
    )
    expect(first).toMatchObject({
      state: 'prepared',
      child: { providerSessionId: 'forked-child', surface: 'terminal' },
      parent: {
        providerSessionId: PARENT,
        promptUuid: 'p1',
        boundaryUuid: 'x1',
        excerpt: 'Found two issues'
      }
    })
    expect(concurrent).toEqual(first)
    expect(retried).toEqual(first)
    expect(await branches.list('wt-1')).toEqual([first])
  })

  it('maps a chat row to the turn it belongs to', async () => {
    const { branches, deps } = service()
    const branch = await branches.prepare({
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: {
        kind: 'chat',
        sessionId: 'chat-1',
        itemId: agentJournalItemKey({ provider: 'claude', sessionId: PARENT, uuid: 'a1' })
      },
      mode: 'full',
      surface: 'chat',
      label: 'Finding 1'
    })
    expect(deps.forkFull).toHaveBeenCalledWith(
      expect.objectContaining({ upToUuid: 'x1' }),
      '/home/.claude'
    )
    expect(branch.parent).toMatchObject({ structuredSessionId: 'chat-1', promptUuid: 'p1' })
  })

  it('maps a row of history the chat resumed from, which has no turn records, by position', async () => {
    const { branches, deps } = service({
      readChatJournal: async () => ({
        items: [
          journalItem(1, 'user', 'p1', 'Review'),
          journalItem(2, 'assistant', 'a1', 'Found two issues'),
          journalItem(3, 'user', 'p2', 'Fix one'),
          journalItem(4, 'assistant', 'a2', 'Fixed')
        ].map((item) => ({ ...item, turnScope: AGENT_JOURNAL_THREAD_SCOPE })),
        submissions: []
      })
    })
    const replyItemId = agentJournalItemKey({ provider: 'claude', sessionId: PARENT, uuid: 'a2' })
    const branch = await branches.prepare({
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: { kind: 'chat', sessionId: 'chat-1', itemId: replyItemId },
      mode: 'full',
      surface: 'chat',
      label: 'After the fix'
    })
    expect(deps.forkFull).toHaveBeenCalledOnce()
    expect(branch.parent).toMatchObject({ promptUuid: 'p2', replyItemId })
  })

  it('compacts into a pre-chosen id with the focus, in the directory Claude ran in', async () => {
    const { branches, deps } = service()
    const branch = await branches.prepare({
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'compact',
      surface: 'chat',
      label: 'Finding 2',
      focus: 'the race in the cache'
    })
    expect(deps.forkCompacted).toHaveBeenCalledWith(
      {
        cwd: '/work',
        sourceSessionId: PARENT,
        boundaryUuid: 'x1',
        targetSessionId: 'child-a',
        focus: 'the race in the cache'
      },
      '/home/.claude'
    )
    expect(branch).toMatchObject({ state: 'prepared', child: { providerSessionId: 'child-a' } })
  })

  it('records a compaction that may have written the child as unverified and never reruns it', async () => {
    const forkCompacted = vi.fn(async () => {
      throw new Error('compaction timed out')
    })
    const { branches } = service({
      forkCompacted,
      findTranscript: async (id) =>
        id === PARENT || id === 'child-a'
          ? { path: transcriptPath(), accountHomePath: '/home/.claude' }
          : null
    })
    const params = {
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'compact',
      surface: 'chat',
      label: 'Finding 2'
    } as const
    await expect(branches.prepare(params)).rejects.toThrow('conversation_branch_fork_unverified')
    expect(await branches.prepare(params)).toMatchObject({ state: 'fork-unverified' })
    expect(forkCompacted).toHaveBeenCalledOnce()
  })

  it('retries a request whose fork failed without writing anything', async () => {
    const forkFull = vi
      .fn<ConversationBranchServiceDeps['forkFull']>()
      .mockRejectedValueOnce(new Error('worker exited'))
      .mockResolvedValueOnce('second-try')
    const { branches } = service({ forkFull })
    const params = {
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'full',
      surface: 'chat',
      label: 'Finding 1'
    } as const
    await expect(branches.prepare(params)).rejects.toThrow('worker exited')
    const retried = await branches.prepare(params)
    expect(retried).toMatchObject({ branchId: 'branch-a', state: 'prepared' })
    expect(retried.child.providerSessionId).toBe('second-try')
    expect(await branches.list('wt-1')).toHaveLength(1)
  })

  it('prepares a clean branch without forking: a terminal gets a fresh id, a chat its own', async () => {
    const { branches, deps } = service()
    const terminal = await branches.prepare({
      requestId: 'r1',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'clean',
      surface: 'terminal',
      label: 'Clean'
    })
    const chat = await branches.prepare({
      requestId: 'r2',
      worktreeId: 'wt-1',
      source: transcriptSource,
      mode: 'clean',
      surface: 'chat',
      label: 'Clean chat',
      childStructuredSessionId: 'chat-9'
    })
    expect(terminal.child.providerSessionId).toBe('child-a')
    expect(chat.child.providerSessionId).toBe('claude-of-chat-9')
    expect(deps.forkFull).not.toHaveBeenCalled()
    expect(deps.forkCompacted).not.toHaveBeenCalled()
  })

  it('refuses a working chat, another workspace and a turn that is not in the transcript', async () => {
    const chatSource = { kind: 'chat', sessionId: 'chat-1', itemId: 'x' } as const
    const base = { worktreeId: 'wt-1', mode: 'full', surface: 'chat', label: 'L' } as const
    await expect(
      service({
        readChat: () => ({ workspaceId: 'wt-1', accountHomePath: '/h', busy: true })
      }).branches.prepare({ ...base, requestId: 'r1', source: chatSource })
    ).rejects.toThrow('conversation_branch_source_busy')
    await expect(
      service().branches.prepare({
        ...base,
        requestId: 'r2',
        worktreeId: 'wt-2',
        source: chatSource
      })
    ).rejects.toThrow('conversation_branch_workspace_mismatch')
    await expect(
      service().branches.prepare({
        ...base,
        requestId: 'r3',
        source: { ...transcriptSource, promptUuid: 'nope' }
      })
    ).rejects.toThrow('conversation_branch_invalid_anchor')
  })
})

function transcriptPath(): string {
  return transcriptFile()
}

describe('ConversationBranchService.chats', () => {
  it('names the Claude conversation of each chat in the workspace, skipping unknown ones', () => {
    const { branches } = service({
      listChatSessionIds: (workspaceId) => (workspaceId === 'wt-1' ? ['s1', 'gone'] : []),
      chatProviderSessionId: (sessionId) => (sessionId === 's1' ? 'claude-1' : null)
    })
    expect(branches.chats('wt-1')).toEqual([{ sessionId: 's1', providerSessionId: 'claude-1' }])
    expect(branches.chats('wt-2')).toEqual([])
  })
})
