import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import {
  appendAutomaticTopicTurn,
  emptyStructuredTopicIndex,
  renameStructuredTopicChapter,
  type StructuredTopicIndex
} from '../../../shared/structured-topic-index'
import { readStructuredTopicIndex } from './structured-agent-session-topic-index'

function message(
  sequence: number,
  role: 'user' | 'assistant',
  text: string
): AgentJournalRenderItem {
  return {
    itemId: `${role}-${sequence}`,
    sequence,
    revision: 1,
    observedAt: sequence,
    body: { kind: 'message', role, blocks: [{ type: 'text', text }] }
  }
}

function tool(sequence: number): AgentJournalRenderItem {
  return {
    itemId: `tool-${sequence}`,
    sequence,
    revision: 1,
    observedAt: sequence,
    body: { kind: 'tool-call', name: 'read', input: {}, state: 'completed' }
  }
}

function lifecycle(sequence: number, state: 'running' | 'completed'): AgentJournalRenderItem {
  return {
    itemId: `status-${sequence}`,
    sequence,
    revision: 1,
    observedAt: sequence,
    body: { kind: 'status', text: state, turnLifecycle: { turnId: 'turn', state } }
  }
}

function harness(items: AgentJournalRenderItem[], initial = emptyStructuredTopicIndex('session')) {
  let stored = initial
  const writeTopicIndex = vi.fn(async (next: StructuredTopicIndex, expected: number) => {
    expect(expected).toBe(stored.revision)
    expect(next.revision).toBe(expected + 1)
    stored = next
    return next
  })
  return {
    session: {
      journal: {
        readTopicIndex: () => stored,
        snapshot: () => ({
          cursor: { epoch: 'epoch', sequence: items.at(-1)?.sequence ?? 0 },
          items
        }),
        writeTopicIndex
      }
    } as never,
    writeTopicIndex,
    stored: () => stored
  }
}

let uuid = 0
beforeEach(() => {
  uuid = 0
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `chapter-${++uuid}`) })
})

describe('readStructuredTopicIndex', () => {
  it('crosses a tool-heavy turn instead of trapping in the first item window', async () => {
    const items = [
      message(1, 'user', 'Investigate login timeout'),
      ...Array.from({ length: 300 }, (_, index) => tool(index + 2)),
      message(302, 'assistant', 'The timeout comes from retry handling')
    ]
    const state = harness(items)

    const result = await readStructuredTopicIndex(state.session)

    expect(result.index.chapters).toHaveLength(1)
    expect(result.index.chapters[0]?.end.itemId).toBe('assistant-302')
    expect(state.writeTopicIndex).toHaveBeenCalledTimes(1)
  })

  it('uses the last assistant response and ignores an unfinished following turn', async () => {
    const state = harness([
      message(1, 'user', 'Design login retries'),
      message(2, 'assistant', 'First partial answer'),
      message(3, 'assistant', 'Final retry answer'),
      message(4, 'user', 'Now inspect billing'),
      lifecycle(5, 'running'),
      message(6, 'assistant', 'Partial billing answer')
    ])

    const result = await readStructuredTopicIndex(state.session)

    expect(result.index.chapters).toHaveLength(1)
    expect(result.index.chapters[0]?.end.itemId).toBe('assistant-3')
  })

  it('durably advances a bounded suffix and catches missed turns on the next read', async () => {
    const items = Array.from({ length: 65 }, (_, index) => [
      message(index * 2 + 1, 'user', `Same topic ${index}`),
      message(index * 2 + 2, 'assistant', `Reply ${index}`)
    ]).flat()
    const state = harness(items)

    const first = await readStructuredTopicIndex(state.session)
    const second = await readStructuredTopicIndex(state.session)

    expect(first.index.chapters.at(-1)?.end.sequence).toBe(128)
    expect(second.index.chapters.at(-1)?.end.sequence).toBe(130)
    expect(state.writeTopicIndex).toHaveBeenCalledTimes(2)
    expect(second.index.revision).toBe(2)
  })

  it('preserves a manual title while extending its adjacent topic after restart', async () => {
    const base = appendAutomaticTopicTurn(emptyStructuredTopicIndex('session'), {
      start: { epoch: 'epoch', itemId: 'user-1', sequence: 1 },
      end: { epoch: 'epoch', itemId: 'assistant-2', sequence: 2 },
      prompt: 'Investigate login retry'
    })
    const renamed = renameStructuredTopicChapter(base, base.chapters[0]!.id, 'Login recovery')
    const state = harness(
      [
        message(1, 'user', 'Investigate login retry'),
        message(2, 'assistant', 'Initial answer'),
        message(3, 'user', 'Continue login recovery'),
        message(4, 'assistant', 'Follow-up answer')
      ],
      renamed
    )

    const result = await readStructuredTopicIndex(state.session)

    expect(result.index.chapters).toHaveLength(1)
    expect(result.index.chapters[0]).toMatchObject({
      title: 'Login recovery',
      titleSource: 'manual',
      end: { itemId: 'assistant-4' }
    })
  })

  it('rebuilds automatic chapters when the journal epoch changes', async () => {
    const previous = appendAutomaticTopicTurn(emptyStructuredTopicIndex('session'), {
      start: { epoch: 'old-epoch', itemId: 'old-user', sequence: 1 },
      end: { epoch: 'old-epoch', itemId: 'old-assistant', sequence: 2 },
      prompt: 'Old topic'
    })
    const state = harness(
      [message(1, 'user', 'New login topic'), message(2, 'assistant', 'New answer')],
      previous
    )

    const result = await readStructuredTopicIndex(state.session)

    expect(result.index.chapters).toHaveLength(1)
    expect(result.index.chapters[0]).toMatchObject({
      start: { epoch: 'epoch', itemId: 'user-1' },
      end: { epoch: 'epoch', itemId: 'assistant-2' }
    })
    expect(result.index.revision).toBe(previous.revision + 1)
  })

  it('does not scan or write when automatic indexing is off or the index is current', async () => {
    const disabled = harness([message(1, 'user', 'Ignored')], {
      ...emptyStructuredTopicIndex('session'),
      revision: 1,
      automatic: false
    })
    expect((await readStructuredTopicIndex(disabled.session)).index.automatic).toBe(false)
    expect(disabled.writeTopicIndex).not.toHaveBeenCalled()

    const current = harness([])
    await readStructuredTopicIndex(current.session)
    expect(current.writeTopicIndex).not.toHaveBeenCalled()

    const alreadyIndexed = appendAutomaticTopicTurn(emptyStructuredTopicIndex('session'), {
      start: { epoch: 'epoch', itemId: 'user-1', sequence: 1 },
      end: { epoch: 'epoch', itemId: 'assistant-2', sequence: 2 },
      prompt: 'Current topic'
    })
    const same = harness(
      [message(1, 'user', 'Current topic'), message(2, 'assistant', 'Answer')],
      alreadyIndexed
    )
    await readStructuredTopicIndex(same.session)
    expect(same.writeTopicIndex).not.toHaveBeenCalled()
  })
})
