import { describe, expect, it, vi } from 'vitest'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import {
  CodexStructuredHistoryLimitError,
  readCodexStructuredSessionHistory
} from './codex-structured-session-history'
import { CodexAppServerRequestError } from './codex-app-server-connection'

const THREAD_ID = 'thread-restored'

function opened() {
  return {
    threadId: THREAD_ID,
    thread: { id: THREAD_ID, historyMode: 'paginated' },
    historyPath: '/rollouts/restored.jsonl',
    historyRequiresRead: true as const
  }
}

describe('structured Codex session history', () => {
  it('hydrates metadata-only resumes in chronology with stable identities on every resume', async () => {
    const rows = new Map<string, AgentJournalItemBody>()
    const appendItem = vi.fn((identity: AgentJournalItemIdentity, body: AgentJournalItemBody) => {
      rows.set(agentJournalItemKey(identity), body)
    })
    const translator = createCodexJournalTranslator({
      sink: { appendItem, appendTombstone: vi.fn(), publish: vi.fn() },
      primaryThreadId: () => THREAD_ID
    })
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) =>
      params?.cursor === null
        ? {
            data: [
              {
                id: 'turn-new',
                items: [{ type: 'agentMessage', id: 'provider-item-4', text: 'new answer' }]
              }
            ],
            nextCursor: 'older'
          }
        : {
            data: [
              {
                id: 'turn-old',
                items: [
                  {
                    type: 'userMessage',
                    id: 'provider-item-1',
                    content: [{ type: 'text', text: 'old question' }]
                  },
                  { type: 'agentMessage', id: 'provider-item-2', text: 'old answer' }
                ]
              }
            ],
            nextCursor: null
          }
    )

    for (let resume = 0; resume < 2; resume += 1) {
      const thread = await readCodexStructuredSessionHistory({
        connection: { request },
        opened: opened()
      })
      translator.restoreThread(THREAD_ID, thread)
    }

    expect([...rows.entries()]).toEqual([
      [
        'codex:thread-restored:turn-old:0',
        { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'old question' }] }
      ],
      [
        'codex:thread-restored:turn-old:1',
        { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'old answer' }] }
      ],
      [
        'codex:thread-restored:turn-new:0',
        { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'new answer' }] }
      ]
    ])
    expect(appendItem).toHaveBeenCalledTimes(6)
    expect(request).toHaveBeenCalledWith(
      'thread/turns/list',
      {
        threadId: THREAD_ID,
        cursor: null,
        sortDirection: 'desc',
        itemsView: 'full',
        limit: 200
      },
      { timeoutMs: undefined }
    )
  })

  it('rejects a cursor cycle before returning partial history', async () => {
    const request = vi.fn(async () => ({
      data: [
        {
          id: `turn-${request.mock.calls.length}`,
          items: [{ type: 'agentMessage', id: 'item', text: 'partial' }]
        }
      ],
      nextCursor: 'repeated'
    }))

    await expect(
      readCodexStructuredSessionHistory({ connection: { request }, opened: opened() })
    ).rejects.toBeInstanceOf(CodexStructuredHistoryLimitError)
  })

  it('bounds empty turns as retained entries', async () => {
    const request = vi.fn(async () => ({
      data: Array.from({ length: 1_025 }, (_, index) => ({
        id: `turn-${index}`,
        items: []
      })),
      nextCursor: null
    }))

    await expect(
      readCodexStructuredSessionHistory({ connection: { request }, opened: opened() })
    ).rejects.toBeInstanceOf(CodexStructuredHistoryLimitError)
  })

  it('falls back only when full-item paging is narrowly unsupported', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'thread/turns/list') {
        throw new CodexAppServerRequestError(
          method,
          -32602,
          'codex app-server thread/turns/list failed: unknown field `itemsView`'
        )
      }
      return {
        thread: {
          id: THREAD_ID,
          turns: [{ id: 'turn-old', items: [] }]
        }
      }
    })

    await expect(
      readCodexStructuredSessionHistory({ connection: { request }, opened: opened() })
    ).resolves.toMatchObject({ id: THREAD_ID, turns: [{ id: 'turn-old' }] })
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'thread/turns/list',
      'thread/read'
    ])
    expect(request).toHaveBeenLastCalledWith(
      'thread/read',
      { threadId: THREAD_ID, includeTurns: true },
      { timeoutMs: undefined }
    )
  })

  it('rejects fallback history for a different thread', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'thread/turns/list') {
        throw new CodexAppServerRequestError(method, -32601, 'method not found')
      }
      return { thread: { id: 'thread-other', turns: [] } }
    })

    await expect(
      readCodexStructuredSessionHistory({ connection: { request }, opened: opened() })
    ).rejects.toThrow('different thread')
  })

  it('does not fall back for ambiguous invalid paging parameters', async () => {
    const error = new CodexAppServerRequestError(
      'thread/turns/list',
      -32602,
      'codex app-server thread/turns/list failed: invalid params'
    )
    const request = vi.fn(async () => {
      throw error
    })

    await expect(
      readCodexStructuredSessionHistory({ connection: { request }, opened: opened() })
    ).rejects.toBe(error)
    expect(request).toHaveBeenCalledOnce()
  })
})
