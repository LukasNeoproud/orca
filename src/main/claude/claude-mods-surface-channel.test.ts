import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { ClaudeModsSurfaceEvent } from '../../shared/claude-mods-surface'
import {
  ClaudeControlRequestError,
  createClaudeControlSurface
} from './claude-agent-sdk-control-requests'
import { ClaudeModsSessionChannel } from './claude-mods-surface-channel'

// Frames as Claude Code 2.1.299 sent them to the probe (tests/tools/claude-mods-surface-probe.mjs).
const PANES_PUSH = {
  type: 'system',
  subtype: 'ui_panes',
  panes: [{ id: 'hello-tabs', title: 'Hello tabs', plugin: 'hello-tabs', close_on_escape: true }],
  shown_id: 'hello-tabs',
  focused_id: null,
  focus_requested_id: 'hello-tabs',
  uuid: '1f9a3a40-e136-4fa7-aabf-04ab97d6a2b0',
  session_id: '9dcf49af-fc3a-437d-bc88-872e3f749854'
}
const EMPTY_ROSTER = { panes: [], shown_id: null, focused_id: null, focus_requested_id: null }

function fakeConnection(answer: (body: Record<string, unknown>) => unknown = () => ({})) {
  const sent: Record<string, unknown>[] = []
  const uiRequest = vi.fn(async (body: Record<string, unknown>) => {
    sent.push(body)
    const value = answer(body)
    if (value instanceof Error) {
      throw value
    }
    return value
  })
  return { connection: { uiRequest }, sent }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('ClaudeModsSessionChannel', () => {
  it('joins the surface roster only once someone subscribes, and reads the panes on mount', async () => {
    const { connection, sent } = fakeConnection((body) =>
      body.subtype === 'ui_panes' ? { ...PANES_PUSH, type: undefined } : { surfaces: ['desktop'] }
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    await flush()
    expect(sent).toEqual([])

    const events: ClaudeModsSurfaceEvent[] = []
    channel.subscribe((event) => events.push(event))
    await flush()
    expect(sent.map((body) => body.subtype)).toEqual(['ui_attach', 'ui_panes'])
    expect(sent[0]).toEqual({ subtype: 'ui_attach', surface: 'desktop', client_id: 'orca' })
    expect(events).toEqual([
      {
        type: 'state',
        available: true,
        roster: {
          panes: [
            { id: 'hello-tabs', title: 'Hello tabs', plugin: 'hello-tabs', close_on_escape: true }
          ],
          shown_id: 'hello-tabs',
          focused_id: null,
          focus_requested_id: 'hello-tabs'
        },
        statuses: {}
      }
    ])
  })

  it('keeps mods pushes out of the transcript and forwards them', async () => {
    const { connection } = fakeConnection((body) =>
      body.subtype === 'ui_panes' ? EMPTY_ROSTER : {}
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    const events: ClaudeModsSurfaceEvent[] = []
    channel.subscribe((event) => events.push(event))
    await flush()
    events.length = 0

    expect(channel.routePush({ type: 'system', subtype: 'init' })).toBe(false)
    expect(channel.routePush({ type: 'assistant', subtype: 'ui_panes' })).toBe(false)
    expect(channel.routePush(PANES_PUSH)).toBe(true)
    expect(
      channel.routePush({ type: 'system', subtype: 'ui_invalidate', event: 'ui.render' })
    ).toBe(true)
    expect(
      channel.routePush({
        type: 'system',
        subtype: 'ui_toast',
        plugin: 'notify',
        text: 'notify ran 1 time',
        timeout_ms: 4000
      })
    ).toBe(true)
    channel.routePush({ type: 'system', subtype: 'ui_status', plugin: 'notify', text: 'notify: 1' })
    channel.routePush({ type: 'system', subtype: 'ui_log', plugin: 'notify', text: 'a line' })
    // A malformed push is still the channel's, but nothing reaches the renderer for it.
    expect(channel.routePush({ type: 'system', subtype: 'ui_toast', plugin: 'notify' })).toBe(true)

    expect(events.map((event) => event.type)).toEqual([
      'panes',
      'invalidate',
      'toast',
      'status',
      'log'
    ])
    expect(events[2]).toEqual({
      type: 'toast',
      plugin: 'notify',
      text: 'notify ran 1 time',
      timeoutMs: 4000
    })

    // A late subscriber's first frame carries the roster and pinned status lines.
    const late: ClaudeModsSurfaceEvent[] = []
    channel.subscribe((event) => late.push(event))
    await flush()
    expect(late[0]).toMatchObject({
      type: 'state',
      roster: { shown_id: 'hello-tabs' },
      statuses: { notify: 'notify: 1' }
    })
    channel.routePush({ type: 'system', subtype: 'ui_status', plugin: 'notify', text: null })
    expect(late.at(-1)).toEqual({ type: 'status', plugin: 'notify', text: null })
  })

  it('names whose surface asks on every request but a close', async () => {
    const { connection, sent } = fakeConnection((body) =>
      body.subtype === 'ui_panes' ? EMPTY_ROSTER : { handled: true }
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    await channel.request('ui_press', { plugin: 'hello-tabs', handle: 7, key: 'more' })
    await channel.request('ui_close', { id: 'hello-tabs' })
    expect(sent.slice(2)).toEqual([
      {
        subtype: 'ui_press',
        plugin: 'hello-tabs',
        handle: 7,
        key: 'more',
        surface: 'desktop',
        client_id: 'orca'
      },
      { subtype: 'ui_close', id: 'hello-tabs' }
    ])
  })

  it('says an older CLI cannot draw mods and refuses requests', async () => {
    const { connection } = fakeConnection(
      () =>
        new ClaudeControlRequestError('ui_attach', 'Unsupported control request subtype: ui_attach')
    )
    const channel = new ClaudeModsSessionChannel(() => {})
    channel.bind(connection)
    const events: ClaudeModsSurfaceEvent[] = []
    channel.subscribe((event) => events.push(event))
    await flush()
    expect(events[0]).toMatchObject({ type: 'state', available: false, reason: 'unsupported-cli' })
    await expect(channel.request('ui_panes', {})).rejects.toThrow('unsupported-cli')
  })

  it('keeps subscribers across a restart and ignores the old child unbinding late', async () => {
    const first = fakeConnection((body) => (body.subtype === 'ui_panes' ? PANES_PUSH : {}))
    const second = fakeConnection((body) => (body.subtype === 'ui_panes' ? EMPTY_ROSTER : {}))
    const idle = vi.fn()
    const channel = new ClaudeModsSessionChannel(idle)
    const unbindFirst = channel.bind(first.connection)
    const events: ClaudeModsSurfaceEvent[] = []
    channel.subscribe((event) => events.push(event))
    await flush()

    const unbindSecond = channel.bind(second.connection)
    await flush()
    unbindFirst()
    await flush()
    expect(second.sent.map((body) => body.subtype)).toEqual(['ui_attach', 'ui_panes'])
    expect(events.at(-1)).toMatchObject({
      type: 'state',
      available: true,
      roster: { panes: [] }
    })

    unbindSecond()
    await flush()
    expect(events.at(-1)).toMatchObject({
      type: 'state',
      available: false,
      reason: 'no-connection'
    })
    expect(idle).not.toHaveBeenCalled()
  })

  it('leaves the roster when the last subscriber goes, and releases an idle channel', async () => {
    const { connection, sent } = fakeConnection((body) =>
      body.subtype === 'ui_panes' ? EMPTY_ROSTER : {}
    )
    const idle = vi.fn()
    const channel = new ClaudeModsSessionChannel(idle)
    const unbind = channel.bind(connection)
    const unsubscribe = channel.subscribe(() => {})
    await flush()
    unsubscribe()
    expect(sent.at(-1)).toEqual({ subtype: 'ui_detach', client_id: 'orca' })
    unbind()
    expect(idle).toHaveBeenCalledWith(channel)
  })
})

describe('createClaudeControlSurface uiRequest', () => {
  it("sends through the SDK's generic request and answers its payload", async () => {
    const request = vi.fn(async () => ({ response: { handled: true, element: 'more' } }))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: uiRequest reads only `request`.
    const controls = createClaudeControlSurface({ request } as unknown as Query)
    await expect(
      controls.uiRequest?.({ subtype: 'ui_press', plugin: 'p', handle: 1 })
    ).resolves.toEqual({ handled: true, element: 'more' })
    expect(request).toHaveBeenCalledWith({ subtype: 'ui_press', plugin: 'p', handle: 1 })
  })

  it('is absent when the SDK exposes no generic sender', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: uiRequest reads only `request`.
    expect(createClaudeControlSurface({} as unknown as Query).uiRequest).toBeUndefined()
  })
})
