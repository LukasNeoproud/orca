import { describe, expect, it, vi } from 'vitest'
import type { ClaudeModsAsk } from '../../shared/claude-mods-prompt-answers'
import { ClaudeControlRequestError } from './claude-agent-sdk-control-requests'
import type { ClaudeModsAskHandler } from './claude-mods-surface-ask-intercept'
import { ClaudeModsSessionChannel } from './claude-mods-surface-channel'

const EMPTY_ROSTER = { panes: [], shown_id: null, focused_id: null, focus_requested_id: null }
const ANSWERS = ['ui_copy', 'ui_prompt_read', 'ui_prompt_fill', 'ui_prompt_suggest']

function answeringConnection(refuse?: (body: Record<string, unknown>) => Error | null) {
  const sent: Record<string, unknown>[] = []
  let handler: ClaudeModsAskHandler | null = null
  const connection = {
    uiRequest: vi.fn(async (body: Record<string, unknown>) => {
      sent.push(body)
      const refusal = refuse?.(body)
      if (refusal) {
        throw refusal
      }
      return body.subtype === 'ui_panes' ? EMPTY_ROSTER : { surfaces: ['desktop'] }
    }),
    answerUiAsks: (next: ClaudeModsAskHandler) => {
      handler = next
      return () => {
        handler = null
      }
    }
  }
  const ask = (request: Record<string, unknown>) =>
    handler
      ? handler(
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests pass only ask subtypes.
          { requestId: 'r', subtype: request.subtype as 'ui_prompt_read', request },
          new AbortController().signal
        )
      : null
  return { connection, sent, ask, installed: () => handler !== null }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const attaches = (sent: Record<string, unknown>[]) =>
  sent.filter((body) => body.subtype === 'ui_attach')

describe('ClaudeModsSessionChannel asks', () => {
  it('names the answers on attach only while a composer listens', async () => {
    const { connection, sent } = answeringConnection()
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    const leave = channel.subscribeAsks(() => {})
    channel.subscribe(() => {})
    await flush()
    expect(attaches(sent)).toEqual([
      { subtype: 'ui_attach', surface: 'desktop', client_id: 'orca', answers: ANSWERS }
    ])

    leave()
    await flush()
    expect(attaches(sent).at(-1)).toEqual({
      subtype: 'ui_attach',
      surface: 'desktop',
      client_id: 'orca',
      answers: []
    })
    channel.subscribeAsks(() => {})
    await flush()
    expect(attaches(sent).at(-1)).toMatchObject({ answers: ANSWERS })
    expect(attaches(sent)).toHaveLength(3)
  })

  it('never names answers when the SDK cannot answer the asks', async () => {
    const { connection, sent } = answeringConnection()
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind({ uiRequest: connection.uiRequest })
    channel.subscribeAsks(() => {})
    channel.subscribe(() => {})
    await flush()
    expect(attaches(sent)).toEqual([
      { subtype: 'ui_attach', surface: 'desktop', client_id: 'orca' }
    ])
  })

  it('attaches without answers when a CLI refuses the field', async () => {
    const { connection, sent } = answeringConnection((body) =>
      body.subtype === 'ui_attach' && body.answers
        ? new ClaudeControlRequestError('ui_attach', 'Unrecognized key: "answers"')
        : null
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    channel.subscribeAsks(() => {})
    const events: unknown[] = []
    channel.subscribe((event) => events.push(event))
    await flush()
    expect(attaches(sent).map((body) => 'answers' in body)).toEqual([true, false])
    expect(events[0]).toMatchObject({ type: 'state', available: true })
  })

  it('keeps answers on a failed attach that is not about the field', async () => {
    const { connection, sent } = answeringConnection((body) =>
      body.subtype === 'ui_attach' && body.answers
        ? new ClaudeControlRequestError('ui_attach', 'Timed out after 30000ms')
        : null
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    channel.subscribeAsks(() => {})
    channel.subscribe(() => {})
    await flush()
    expect(attaches(sent).every((body) => 'answers' in body)).toBe(true)
  })

  it('hands an ask to the composer and settles it with the answer', async () => {
    const { connection, ask } = answeringConnection()
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    const seen: ClaudeModsAsk[] = []
    channel.subscribeAsks((next) => seen.push(next))
    const answer = ask({ subtype: 'ui_prompt_read', surface: 'desktop', client_id: 'orca' })
    expect(seen).toEqual([{ id: expect.any(String), subtype: 'ui_prompt_read' }])
    expect(channel.answerAsk(seen[0]!.id, { text: 'draft', cursor: 5 })).toBe(true)
    await expect(answer).resolves.toEqual({ text: 'draft', cursor: 5 })
  })

  it('settles a pending ask with the default when the child goes, and stays until composers leave', async () => {
    const { connection, ask, installed } = answeringConnection()
    const idle = vi.fn()
    const channel = new ClaudeModsSessionChannel(idle)
    const unbind = channel.bind(connection)
    const leave = channel.subscribeAsks(() => {})
    const answer = ask({ subtype: 'ui_prompt_fill', text: 'x' })
    unbind()
    await expect(answer).resolves.toEqual({ filled: false })
    expect(installed()).toBe(false)
    expect(idle).not.toHaveBeenCalled()
    leave()
    expect(idle).toHaveBeenCalledWith(channel)
  })
})
