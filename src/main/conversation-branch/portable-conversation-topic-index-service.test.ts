import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import type {
  PortableConversationSourceCursor,
  PortableConversationSourcePage
} from '../../shared/portable-conversation-source'
import {
  mergeStructuredTopicChapters,
  renameStructuredTopicChapter,
  splitStructuredTopicChapter
} from '../../shared/structured-topic-index'
import { PortableConversationTopicIndexStore } from '../runtime/portable-conversation-topic-index-store'
import {
  readPortableConversationTopicIndex,
  writePortableConversationTopicIndex
} from './portable-conversation-topic-index-service'

const roots: string[] = []
const source = {
  executionHostId: 'ssh:host-a' as const,
  workspace: { id: 'worktree-a', path: '/repo', kind: 'git-worktree' as const },
  provider: { agent: 'codex' as const, sessionId: 'provider-a' },
  transcriptPath: '/sessions/provider-a.jsonl'
}
const identity = { fingerprint: 'fingerprint-a', size: 100, mtimeMs: 10 }

function message(id: string, role: 'user' | 'assistant', text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

function cursor(offset: number): PortableConversationSourceCursor {
  return {
    offset,
    boundaryCheckpoint: offset ? `checkpoint-${offset}` : null,
    fileFingerprint: identity.fingerprint
  }
}

function page(
  offset: number,
  messages: NativeChatMessage[],
  nextOffset?: number,
  size = identity.size,
  turnEvidence?: PortableConversationSourcePage['turnEvidence']
): PortableConversationSourcePage {
  return {
    source,
    transcriptMessages: messages,
    cursor: cursor(offset),
    nextCursor: nextOffset === undefined ? null : cursor(nextOffset),
    identity: { ...identity, size },
    limited: nextOffset !== undefined,
    warnings: [],
    ...(turnEvidence ? { turnEvidence } : {})
  }
}

async function setup(pages: PortableConversationSourcePage[]) {
  const root = await mkdtemp(join(tmpdir(), 'orca-portable-topics-'))
  roots.push(root)
  const store = await PortableConversationTopicIndexStore.open(root)
  const readPage = vi.fn(async () => {
    const next = pages.shift()
    if (!next) {
      throw new Error('unexpected read')
    }
    return next
  })
  return { root, store, readPage }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable conversation topic index', () => {
  it('exposes bounded continuation and carries an incomplete turn across pages', async () => {
    const dependencies = await setup([
      page(0, [message('user-1', 'user', 'Plan database migration')], 50, identity.size, {
        completedAssistantMessageIds: [],
        pendingAssistantMessageId: null
      }),
      page(50, [message('assistant-1', 'assistant', 'Migration plan')], 80, identity.size, {
        completedAssistantMessageIds: [],
        pendingAssistantMessageId: 'assistant-1'
      }),
      page(80, [], undefined, identity.size, {
        completedAssistantMessageIds: ['assistant-1'],
        pendingAssistantMessageId: null
      })
    ])
    const first = await readPortableConversationTopicIndex(dependencies, { source })
    expect(first).toMatchObject({ limited: true, index: { chapters: [] } })
    expect(first.anchors['user-1']).toMatchObject({
      messageId: 'user-1',
      cursor: { offset: 0 }
    })
    expect(dependencies.readPage).toHaveBeenCalledOnce()

    const cached = await readPortableConversationTopicIndex(dependencies, { source })
    expect(cached).toEqual(first)
    expect(dependencies.readPage).toHaveBeenCalledOnce()

    const pending = await readPortableConversationTopicIndex(dependencies, {
      source,
      refresh: true
    })
    expect(pending).toMatchObject({ limited: true, index: { chapters: [] } })
    const completed = await readPortableConversationTopicIndex(dependencies, {
      source,
      refresh: true
    })
    expect(completed.limited).toBe(false)
    expect(completed.index.chapters).toHaveLength(1)
    expect(completed.index.chapters[0]).toMatchObject({
      start: { itemId: 'user-1', sequence: 0 },
      end: { itemId: 'assistant-1', sequence: 1 }
    })
    expect(dependencies.readPage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ pendingAssistantMessageId: 'assistant-1' })
    )
  })

  it('preserves rename, split, merge, automatic-off, and revision through tail refresh', async () => {
    const initial = page(
      0,
      [
        message('user-1', 'user', 'Fix login retry'),
        message('assistant-1', 'assistant', 'First answer'),
        message('user-2', 'user', 'Improve login retry'),
        message('assistant-2', 'assistant', 'Second answer')
      ],
      undefined,
      identity.size,
      {
        completedAssistantMessageIds: ['assistant-1', 'assistant-2'],
        pendingAssistantMessageId: null
      }
    )
    const appendedRetry = page(
      0,
      [
        ...initial.transcriptMessages,
        message('user-3', 'user', 'Improve retry design'),
        message('assistant-3', 'assistant', 'Retry answer')
      ],
      undefined,
      180,
      {
        completedAssistantMessageIds: ['assistant-1', 'assistant-2', 'assistant-3'],
        pendingAssistantMessageId: null
      }
    )
    const appendedAfterDisable = page(
      0,
      [
        ...appendedRetry.transcriptMessages,
        message('user-4', 'user', 'Plan database migration'),
        message('assistant-4', 'assistant', 'Migration answer')
      ],
      undefined,
      240,
      {
        completedAssistantMessageIds: ['assistant-1', 'assistant-2', 'assistant-3', 'assistant-4'],
        pendingAssistantMessageId: null
      }
    )
    const dependencies = await setup([initial, appendedRetry, appendedAfterDisable])
    const first = await readPortableConversationTopicIndex(dependencies, { source })
    const chapter = first.index.chapters[0]!
    const renamed = renameStructuredTopicChapter(first.index, chapter.id, 'Authentication recovery')
    await writePortableConversationTopicIndex(dependencies, {
      source,
      index: renamed,
      expectedRevision: first.index.revision
    })
    const split = splitStructuredTopicChapter(
      renamed,
      chapter.id,
      { epoch: identity.fingerprint, itemId: 'user-2', sequence: 2 },
      'Retry design'
    )
    await writePortableConversationTopicIndex(dependencies, {
      source,
      index: split,
      expectedRevision: renamed.revision
    })
    const extended = await readPortableConversationTopicIndex(dependencies, {
      source,
      refresh: true
    })
    expect(extended.index.chapters).toHaveLength(2)
    expect(extended.index.chapters[0]).toMatchObject({
      title: 'Authentication recovery',
      boundaryAfterManual: true,
      end: { itemId: 'user-2' }
    })
    expect(extended.index.chapters[1]).toMatchObject({
      title: 'Retry design',
      end: { itemId: 'assistant-3' }
    })
    const merged = mergeStructuredTopicChapters(
      extended.index,
      extended.index.chapters[0]!.id,
      extended.index.chapters[1]!.id,
      'Auth flow'
    )
    await writePortableConversationTopicIndex(dependencies, {
      source,
      index: merged,
      expectedRevision: extended.index.revision
    })
    const disabled = { ...merged, revision: merged.revision + 1, automatic: false }
    const saved = await writePortableConversationTopicIndex(dependencies, {
      source,
      index: disabled,
      expectedRevision: merged.revision
    })
    expect(saved.index).toMatchObject({ automatic: false, chapters: [{ title: 'Auth flow' }] })

    const refreshed = await readPortableConversationTopicIndex(dependencies, {
      source,
      refresh: true
    })
    expect(refreshed.index).toEqual(saved.index)
    expect(refreshed.anchors['user-4']).toMatchObject({ messageId: 'user-4' })

    const reopened = await PortableConversationTopicIndexStore.open(dependencies.root)
    expect(reopened.get(saved.index.sessionId)?.index).toEqual(saved.index)
  })

  it('fences stale manual writes and rejects a different source for the same synthetic id', async () => {
    const dependencies = await setup([
      page(
        0,
        [message('user-1', 'user', 'Fix login'), message('assistant-1', 'assistant', 'Done')],
        undefined,
        identity.size,
        { completedAssistantMessageIds: ['assistant-1'], pendingAssistantMessageId: null }
      )
    ])
    const first = await readPortableConversationTopicIndex(dependencies, { source })
    const forged = {
      ...first.index,
      revision: first.index.revision + 1,
      chapters: first.index.chapters.map((chapter) => ({
        ...chapter,
        start: { ...chapter.start, sequence: 999 }
      }))
    }
    await expect(
      writePortableConversationTopicIndex(dependencies, {
        source,
        index: forged,
        expectedRevision: first.index.revision
      })
    ).rejects.toThrow('portable_conversation_topic_index_anchor_invalid')
    const changed = { ...first.index, revision: first.index.revision + 1, automatic: false }
    await writePortableConversationTopicIndex(dependencies, {
      source,
      index: changed,
      expectedRevision: first.index.revision
    })
    await expect(
      writePortableConversationTopicIndex(dependencies, {
        source,
        index: changed,
        expectedRevision: first.index.revision
      })
    ).rejects.toThrow('portable_conversation_topic_index_stale')

    await expect(
      readPortableConversationTopicIndex(dependencies, {
        source: { ...source, workspace: { ...source.workspace, path: '/forged' } }
      })
    ).rejects.toThrow('portable_conversation_topic_index_source_mismatch')
  })

  it('keeps the durable index when a later SSH refresh is unverifiable', async () => {
    const dependencies = await setup([
      page(
        0,
        [message('user-1', 'user', 'Fix login'), message('assistant-1', 'assistant', 'Done')],
        undefined,
        identity.size,
        { completedAssistantMessageIds: ['assistant-1'], pendingAssistantMessageId: null }
      )
    ])
    const first = await readPortableConversationTopicIndex(dependencies, { source })
    dependencies.readPage.mockRejectedValueOnce(new Error('source_unavailable'))
    await expect(
      readPortableConversationTopicIndex(dependencies, { source, refresh: true })
    ).rejects.toThrow('source_unavailable')
    expect(await readPortableConversationTopicIndex(dependencies, { source })).toEqual(first)
  })

  it('rejects a transcript page that cannot prove assistant completion', async () => {
    const dependencies = await setup([
      page(0, [
        message('user-1', 'user', 'Fix login'),
        message('assistant-1', 'assistant', 'Maybe')
      ])
    ])

    await expect(readPortableConversationTopicIndex(dependencies, { source })).rejects.toThrow(
      'portable_conversation_topic_index_completion_unverifiable'
    )
    expect(dependencies.readPage).toHaveBeenCalledOnce()
  })

  it('does not persist an assistant row that provider evidence excludes as a final response', async () => {
    const dependencies = await setup([
      page(
        0,
        [
          message('user-1', 'user', 'Inspect the repository'),
          message('assistant-commentary', 'assistant', 'I will inspect it now.')
        ],
        undefined,
        identity.size,
        { completedAssistantMessageIds: [], pendingAssistantMessageId: null }
      )
    ])

    const result = await readPortableConversationTopicIndex(dependencies, { source })

    expect(result.index.chapters).toEqual([])
    expect(result.anchors['user-1']).toMatchObject({ messageId: 'user-1' })
  })
})
