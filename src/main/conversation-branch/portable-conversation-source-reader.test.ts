import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type {
  PortableConversationSource,
  PortableConversationSourceCursor
} from '../../shared/portable-conversation-source'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import type { IFilesystemProvider } from '../providers/types'
import type { WorkerTranscriptReadResult } from '../runtime/orchestration/worker-transcript-read'
import { remoteWorkerTranscriptSourceIdentity } from '../runtime/orchestration/worker-transcript-source-identity'
import {
  createPortableConversationSourceReader,
  type PortableConversationSourceError,
  type PortableConversationSourceReaderDependencies
} from './portable-conversation-source-reader'

const source: PortableConversationSource = {
  executionHostId: 'ssh:host-a',
  workspace: { id: 'worktree-a', path: '/repo', kind: 'git-worktree' },
  provider: { agent: 'codex', sessionId: 'provider-a' },
  transcriptPath: '/home/ada/.codex/sessions/provider-a.jsonl'
}

const SOURCE_STAT = { size: 400, type: 'file' as const, mtime: 100, dev: 1, ino: 2 }
const FILE_FINGERPRINT = remoteWorkerTranscriptSourceIdentity(SOURCE_STAT)!.fingerprint
const identity = { fingerprint: FILE_FINGERPRINT, size: 400, mtimeMs: 100 }

const cursor: PortableConversationSourceCursor = {
  offset: 0,
  boundaryCheckpoint: null,
  fileFingerprint: FILE_FINGERPRINT
}

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'row-a',
    executionHostId: source.executionHostId,
    agent: 'codex',
    sessionId: source.provider.sessionId,
    title: 'Source',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: source.transcriptPath,
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume provider-a',
    subagent: null,
    ...overrides
  }
}

function message(id: string, role: 'user' | 'assistant', text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

function transcriptPage(args: {
  messages: NativeChatMessage[]
  nextOffset: number
  fingerprint?: string
  checkpoint?: string
  limited?: boolean
  completedAssistantMessageIds?: string[]
  pendingAssistantMessageId?: string | null
}): WorkerTranscriptReadResult {
  return {
    ok: true,
    filePath: source.transcriptPath,
    sourceFingerprint: args.fingerprint ?? FILE_FINGERPRINT,
    boundaryCheckpoint: args.checkpoint ?? `checkpoint-${args.nextOffset}`,
    messages: args.messages,
    nextOffset: args.nextOffset,
    limited: args.limited ?? false,
    clipping: [],
    warnings: [],
    ...(args.completedAssistantMessageIds || args.pendingAssistantMessageId !== undefined
      ? {
          turnEvidence: {
            completedAssistantMessageIds: args.completedAssistantMessageIds ?? [],
            pendingAssistantMessageId: args.pendingAssistantMessageId ?? null
          }
        }
      : {})
  }
}

function provider(): IFilesystemProvider {
  return {
    stat: vi.fn().mockResolvedValue(SOURCE_STAT)
  } as unknown as IFilesystemProvider
}

type TranscriptReader = NonNullable<PortableConversationSourceReaderDependencies['readTranscript']>

function reader(
  overrides: {
    sessions?: readonly AiVaultSession[]
    provider?: IFilesystemProvider | null
    readTranscript?: ReturnType<typeof vi.fn>
  } = {}
) {
  const readTranscript = overrides.readTranscript ?? vi.fn()
  return {
    readTranscript,
    reader: createPortableConversationSourceReader({
      listSessions: vi.fn().mockResolvedValue(overrides.sessions ?? [session()]),
      getFilesystemProvider: vi.fn().mockReturnValue(overrides.provider ?? provider()),
      readTranscript: readTranscript as TranscriptReader
    })
  }
}

describe('portable prompt analysis anchor', () => {
  it('requires an explicit user-role request and never includes a later reply', async () => {
    const { reader: sourceReader } = reader({
      readTranscript: vi.fn().mockResolvedValue(
        transcriptPage({
          messages: [
            message('ask', 'user', 'Implement two independent outcomes'),
            message('later', 'assistant', 'Later decision')
          ],
          nextOffset: 400
        })
      )
    })
    const anchor = { messageId: 'ask', cursor, identity }
    await expect(sourceReader.readContext({ source, anchor, mode: 'targeted' })).rejects.toThrow(
      'Only an assistant'
    )
    const context = await sourceReader.readContext({
      source,
      anchor,
      mode: 'targeted',
      anchorRole: 'user'
    })
    expect(context.selectedPassage).toBe('Implement two independent outcomes')
    expect(context.contextMarkdown).not.toContain('Later decision')
    await expect(
      sourceReader.readContext({ source, anchor, mode: 'history', anchorRole: 'user' })
    ).rejects.toThrow('targeted context')
  })
})

describe('portable SSH conversation source reader', () => {
  it('reads an anchored chronological page through the verified SSH provider', async () => {
    const { reader: sourceReader, readTranscript } = reader()
    readTranscript.mockResolvedValue(
      transcriptPage({ messages: [message('m-1', 'assistant', 'One')], nextOffset: 24 })
    )

    const page = await sourceReader.readPage({ source })

    expect(readTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        filesystemProvider: expect.anything(),
        transcriptPath: source.transcriptPath
      })
    )
    expect(page.cursor).toEqual(cursor)
    expect(page.nextCursor).toBeNull()
    expect(page.transcriptMessages.map((entry) => entry.id)).toEqual(['m-1'])
  })

  it('prepares targeted context from the exact selected passage without reading older history', async () => {
    const { reader: sourceReader, readTranscript } = reader()
    readTranscript.mockResolvedValue(
      transcriptPage({
        messages: [
          message('m-1', 'assistant', 'Investigate the cache and preserve existing retries.'),
          message('m-2', 'assistant', 'A later decision is excluded.')
        ],
        nextOffset: 48,
        completedAssistantMessageIds: ['m-1']
      })
    )

    const context = await sourceReader.readContext({
      source,
      anchor: { messageId: 'm-1', cursor, identity, selectedText: 'preserve existing retries' },
      mode: 'targeted'
    })

    expect(readTranscript).toHaveBeenCalledTimes(1)
    expect(context.selectedPassage).toBe('preserve existing retries')
    expect(context.contextMarkdown).toContain('preserve existing retries')
    expect(context.contextMarkdown).not.toContain('A later decision')
  })

  it('walks history in order and excludes records after the selected response', async () => {
    const { reader: sourceReader, readTranscript } = reader()
    readTranscript.mockImplementation(async ({ offset }: { offset: number }) => {
      if (offset === 0) {
        return transcriptPage({
          messages: [message('u-1', 'user', 'Initial task')],
          nextOffset: 20,
          limited: true
        })
      }
      return transcriptPage({
        messages: [
          message('a-1', 'assistant', 'Selected answer'),
          message('a-2', 'assistant', 'Later decision')
        ],
        nextOffset: 60,
        completedAssistantMessageIds: ['a-1'],
        pendingAssistantMessageId: 'a-2'
      })
    })

    const context = await sourceReader.readContext({
      source,
      anchor: {
        messageId: 'a-1',
        cursor: {
          offset: 20,
          boundaryCheckpoint: 'checkpoint-20',
          fileFingerprint: FILE_FINGERPRINT
        },
        identity
      },
      mode: 'history'
    })

    expect(readTranscript.mock.calls.map(([args]) => args.offset)).toEqual([0, 20])
    expect(context.contextMarkdown).toContain('Initial task')
    expect(context.contextMarkdown).toContain('Selected answer')
    expect(context.contextMarkdown).not.toContain('Later decision')
  })

  it('refuses a stale selected passage and does not substitute the transcript tail', async () => {
    const { reader: sourceReader, readTranscript } = reader()
    readTranscript.mockResolvedValue(
      transcriptPage({
        messages: [message('m-1', 'assistant', 'Current response')],
        nextOffset: 24,
        completedAssistantMessageIds: ['m-1']
      })
    )

    await expect(
      sourceReader.readContext({
        source,
        anchor: { messageId: 'm-1', cursor, identity, selectedText: 'stale selection' },
        mode: 'targeted'
      })
    ).rejects.toMatchObject({
      code: 'selected_text_mismatch'
    } satisfies Partial<PortableConversationSourceError>)
    expect(readTranscript).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the scanner no longer verifies the exact SSH source', async () => {
    const { reader: sourceReader, readTranscript } = reader({
      sessions: [session({ cwd: '/other' })]
    })

    await expect(sourceReader.readPage({ source })).rejects.toMatchObject({
      code: 'source_unavailable'
    })
    expect(readTranscript).not.toHaveBeenCalled()
  })

  it('fails closed when the source identity changes before the transcript read', async () => {
    const changingProvider = provider()
    vi.mocked(changingProvider.stat)
      .mockResolvedValueOnce({ size: 400, type: 'file', mtime: 100, dev: 1, ino: 2 })
      .mockResolvedValueOnce({ size: 400, type: 'file', mtime: 100, dev: 1, ino: 3 })
    const { reader: sourceReader, readTranscript } = reader({ provider: changingProvider })
    readTranscript.mockResolvedValue(
      transcriptPage({ messages: [message('m-1', 'assistant', 'One')], nextOffset: 24 })
    )

    await expect(sourceReader.readPage({ source, cursor })).rejects.toMatchObject({
      code: 'source_changed'
    })
  })

  it('rejects an in-place rewrite after the selected page was read', async () => {
    const rewrittenProvider = provider()
    vi.mocked(rewrittenProvider.stat).mockResolvedValue({
      size: 400,
      type: 'file',
      mtime: 101,
      dev: 1,
      ino: 2
    })
    const { reader: sourceReader, readTranscript } = reader({ provider: rewrittenProvider })
    readTranscript.mockResolvedValue(
      transcriptPage({
        messages: [message('m-1', 'assistant', 'Verified response')],
        nextOffset: 24
      })
    )

    await expect(
      sourceReader.readContext({
        source,
        anchor: { messageId: 'm-1', cursor, identity },
        mode: 'targeted'
      })
    ).rejects.toMatchObject({ code: 'source_changed' })
  })

  it('carries a server-owned assistant candidate to a completion marker on the next page', async () => {
    const { reader: sourceReader, readTranscript } = reader()
    readTranscript
      .mockResolvedValueOnce(
        transcriptPage({
          messages: [message('m-1', 'assistant', 'Verified response')],
          nextOffset: 24,
          limited: true,
          pendingAssistantMessageId: 'm-1'
        })
      )
      .mockResolvedValueOnce(
        transcriptPage({
          messages: [],
          nextOffset: 40,
          completedAssistantMessageIds: ['m-1']
        })
      )

    const context = await sourceReader.readContext({
      source,
      anchor: { messageId: 'm-1', cursor, identity },
      mode: 'targeted'
    })

    expect(context.selectedPassage).toBe('Verified response')
    expect(readTranscript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 24, pendingAssistantMessageId: 'm-1' })
    )
  })

  it('does not treat a stable EOF or missing host evidence as completion proof', async () => {
    for (const result of [
      transcriptPage({
        messages: [message('m-1', 'assistant', 'Still running')],
        nextOffset: 24,
        pendingAssistantMessageId: 'm-1'
      }),
      transcriptPage({
        messages: [message('m-1', 'assistant', 'Unknown host state')],
        nextOffset: 24
      })
    ]) {
      const { reader: sourceReader } = reader({
        readTranscript: vi.fn().mockResolvedValue(result)
      })
      await expect(
        sourceReader.readContext({
          source,
          anchor: { messageId: 'm-1', cursor, identity },
          mode: 'targeted'
        })
      ).rejects.toMatchObject({ code: 'turn_completion_unverifiable' })
    }
  })
})
