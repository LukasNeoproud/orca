import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
import { CodexAppServerRequestError } from './codex-app-server-connection'
import { ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS } from './codex-orca-interaction'
import { createCodexDispatchEchoes } from './codex-structured-dispatch-echo'
import { createCodexTurnOpenWaits } from './codex-structured-turn-open-wait'
import { startCodexTurn, type CodexTurnHost } from './codex-structured-turn-start'

const body: AgentJournalMessageItem = {
  kind: 'message',
  role: 'user',
  blocks: [{ type: 'text', text: 'Keep my\nprepared prompt' }]
}

const input = [{ type: 'text', text: 'Keep my\nprepared prompt' }]

function host(): CodexTurnHost & { connection: { request: ReturnType<typeof vi.fn> } } {
  return {
    connection: { request: vi.fn(async () => ({ turn: { id: 'turn-1' } })) },
    threadId: 'thread-1',
    options: new Map(),
    dispatchEchoes: createCodexDispatchEchoes(),
    turnOpenWaits: createCodexTurnOpenWaits(),
    resumedInteractiveChat: true
  }
}

function turnStartParams(session: ReturnType<typeof host>): Record<string, unknown>[] {
  return session.connection.request.mock.calls
    .filter(([method]) => method === 'turn/start')
    .map(([, params]) => params as Record<string, unknown>)
}

describe('Codex interactive UI context on resumed turns', () => {
  it('adds application context to every resumed turn without changing the input', async () => {
    const session = host()
    const originalBody = structuredClone(body)

    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    await startCodexTurn(session, { clientMessageId: 'message-2', body })

    const params = turnStartParams(session)
    expect(params).toHaveLength(2)
    for (const entry of params) {
      expect(entry).toMatchObject({
        threadId: 'thread-1',
        input,
        additionalContext: {
          'orca.interactive': {
            kind: 'application',
            value: ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS
          }
        }
      })
    }
    expect(body).toEqual(originalBody)
  })

  it('retries without application context once and caches that narrow refusal', async () => {
    const session = host()
    session.connection.request = vi.fn(
      async (_method: string, params?: { additionalContext?: unknown }) => {
        if (params?.additionalContext) {
          throw new CodexAppServerRequestError(
            'turn/start',
            -32602,
            'unknown field `additionalContext`'
          )
        }
        return { turn: { id: 'turn-1' } }
      }
    )

    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    await startCodexTurn(session, { clientMessageId: 'message-2', body })

    const params = turnStartParams(session)
    expect(params).toHaveLength(3)
    expect(params[0]).toHaveProperty(
      ['additionalContext', 'orca.interactive', 'kind'],
      'application'
    )
    expect(params[1]).not.toHaveProperty('additionalContext')
    expect(params[2]).not.toHaveProperty('additionalContext')
    expect(params.map((entry) => entry.input)).toEqual([input, input, input])
  })

  it('does not retry unrelated invalid turn parameters', async () => {
    const error = new CodexAppServerRequestError('turn/start', -32602, 'invalid value for `model`')
    const session = host()
    session.connection.request = vi.fn(async () => {
      throw error
    })

    await expect(startCodexTurn(session, { clientMessageId: 'message-1', body })).rejects.toBe(
      error
    )
    expect(session.connection.request).toHaveBeenCalledOnce()
  })
})
