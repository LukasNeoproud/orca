import { describe, expect, it, vi } from 'vitest'
import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import { CLAUDE_MODS_BAND_ID, ClaudeModsSurfaceController } from './claude-mods-surface-controller'

// The hello-tabs Pane tree as Claude Code 2.1.299 answered ui_render.
const HELLO_TABS_TREE = {
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [
    {
      type: 'Button',
      props: { key: 'tab-two', label: 'Two', hotkey: '2', plain: true, dimColor: true },
      press: { plugin: 'hello-tabs', handle: 784744200 }
    },
    { type: 'Text', children: ['This is the first tab.'] }
  ],
  part: { plugin: 'hello-tabs' }
}
const ROSTER = {
  panes: [{ id: 'hello-tabs', title: 'Hello tabs', plugin: 'hello-tabs' }],
  shown_id: 'hello-tabs',
  focused_id: null,
  focus_requested_id: null
}

type Call = { subtype: ClaudeModsRequestSubtype; fields: Record<string, unknown> }

function harness(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype, fields) => {
        const call = { subtype, fields }
        calls.push(call)
        return answer(call)
      },
      subscribe: async (handlers) => {
        emit = handlers.onEvent
        return { unsubscribe: () => {} }
      }
    },
    vi.fn()
  )
  controller.start()
  return { controller, calls, emit: (event: ClaudeModsSurfaceEvent) => emit(event) }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function renderAnswer(call: Call): unknown {
  if (call.subtype !== 'ui_render') {
    return { handled: true }
  }
  return call.fields.component === 'Pane'
    ? { tree: HELLO_TABS_TREE, hooked: true, drawn_by: ['hello-tabs'] }
    : { tree: { type: 'engine', ref: 0 }, hooked: false, drawn_by: [] }
}

describe('ClaudeModsSurfaceController', () => {
  it('draws the band and the shown pane once the host says mods are available', async () => {
    const { controller, calls, emit } = harness(renderAnswer)
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    expect(calls.map((call) => [call.subtype, call.fields.instance_id])).toEqual([
      ['ui_render', CLAUDE_MODS_BAND_ID],
      ['ui_render', 'hello-tabs']
    ])
    const snapshot = controller.getSnapshot()
    expect(snapshot.drawings['hello-tabs']?.drawnBy).toEqual(['hello-tabs'])
    expect(snapshot.drawings['hello-tabs']?.tree).toMatchObject({ kind: 'element', type: 'Box' })
    expect(snapshot.drawings[CLAUDE_MODS_BAND_ID]?.hooked).toBe(false)
  })

  it('stops asking for a band nothing draws until something invalidates', async () => {
    const { calls, emit } = harness(renderAnswer)
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    calls.length = 0
    emit({ type: 'invalidate', instances: ['hello-tabs'] })
    await flush()
    expect(calls.map((call) => call.fields.instance_id)).toEqual(['hello-tabs'])
    calls.length = 0
    emit({ type: 'invalidate' })
    await flush()
    expect(calls.map((call) => call.fields.instance_id)).toEqual([
      CLAUDE_MODS_BAND_ID,
      'hello-tabs'
    ])
  })

  it('folds invalidations that land while a drawing is in flight into one more ask', async () => {
    let release: () => void = () => {}
    const { calls, emit } = harness(async (call) => {
      if (call.fields.instance_id === 'hello-tabs') {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return renderAnswer(call)
    })
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    emit({ type: 'invalidate', instances: ['hello-tabs'] })
    emit({ type: 'invalidate', instances: ['hello-tabs'] })
    emit({ type: 'invalidate', instances: ['hello-tabs'] })
    release()
    await flush()
    release()
    await flush()
    expect(calls.filter((call) => call.fields.instance_id === 'hello-tabs')).toHaveLength(2)
  })

  it('asks again when a press reaches a handle a redraw retired', async () => {
    const { controller, calls, emit } = harness((call) =>
      call.subtype === 'ui_press' ? { handled: false } : renderAnswer(call)
    )
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    calls.length = 0
    // No key, so nothing to heal the handle against: the engine's refusal asks for a redraw.
    controller.press('hello-tabs', { plugin: 'hello-tabs', handle: 1 })
    await flush()
    expect(calls.map((call) => call.subtype)).toEqual(['ui_press', 'ui_render'])
    expect(calls[0]?.fields).toEqual({ plugin: 'hello-tabs', handle: 1 })
  })

  it('heals a press on a superseded drawing to the newest handle, after a redraw in flight', async () => {
    let releaseRender: () => void = () => {}
    let held = false
    const { controller, calls, emit } = harness((call) => {
      if (call.subtype === 'ui_render' && held && call.fields.instance_id === 'hello-tabs') {
        return new Promise((resolve) => {
          releaseRender = () => resolve(renderAnswer(call))
        })
      }
      return renderAnswer(call)
    })
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    held = true
    controller.redraw('hello-tabs')
    calls.length = 0
    controller.press('hello-tabs', { plugin: 'hello-tabs', handle: 1 }, 'tab-two')
    controller.press('hello-tabs', { plugin: 'hello-tabs', handle: 1 }, 'tab-two')
    await flush()
    expect(calls).toEqual([])
    releaseRender()
    await flush()
    expect(calls).toEqual([
      {
        subtype: 'ui_press',
        fields: { plugin: 'hello-tabs', handle: 784744200, key: 'tab-two' }
      }
    ])
  })

  it('reports an unchanged pane holder when it answers a focus request', async () => {
    const { controller, calls, emit } = harness(renderAnswer)
    await flush()
    emit({
      type: 'state',
      available: true,
      roster: { ...ROSTER, focused_id: 'hello-tabs' },
      statuses: {}
    })
    await flush()
    calls.length = 0
    controller.focusPane('hello-tabs')
    controller.focusPane('hello-tabs', true)
    expect(calls).toEqual([{ subtype: 'ui_pane_focus', fields: { id: 'hello-tabs' } }])
  })

  it('draws the first pane when the roster names none shown', async () => {
    const { calls, emit } = harness(renderAnswer)
    await flush()
    emit({ type: 'state', available: true, roster: { ...ROSTER, shown_id: null }, statuses: {} })
    await flush()
    expect(calls.map((call) => call.fields.instance_id)).toContain('hello-tabs')
  })

  it('names the site an input was typed in, so a retired handle re-resolves', async () => {
    const { controller, calls } = harness(renderAnswer)
    await controller.input('notes', { plugin: 'notes', handle: 4 }, 'new-note', 'submit', 'milk')
    expect(calls[0]).toEqual({
      subtype: 'ui_input',
      fields: {
        plugin: 'notes',
        handle: 4,
        kind: 'submit',
        value: 'milk',
        key: 'new-note',
        component: 'Pane',
        instance_id: 'notes'
      }
    })
  })

  it('drops a drawing that answers after a new child took over', async () => {
    let release: () => void = () => {}
    const { controller, emit } = harness(async (call) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return renderAnswer(call)
    })
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    emit({ type: 'state', available: false, reason: 'no-connection', roster: ROSTER, statuses: {} })
    release()
    await flush()
    expect(controller.getSnapshot().drawings).toEqual({})
  })

  it('forgets a closed pane', async () => {
    const { controller, emit } = harness(renderAnswer)
    await flush()
    emit({ type: 'state', available: true, roster: ROSTER, statuses: {} })
    await flush()
    emit({ type: 'panes', roster: { ...ROSTER, panes: [], shown_id: null } })
    expect(controller.getSnapshot().drawings['hello-tabs']).toBeUndefined()
  })

  it('tells the engine how a mounted site laid out its last drawing', async () => {
    const { controller, calls, emit } = harness(renderAnswer)
    controller.layout.register('hello-tabs', () => ({
      offset: 3,
      bodyRows: 10,
      bodyColumns: 44,
      contentRows: 30,
      keyed: [{ plugin: 'hello-tabs', key: 'tab-two', top: 4, bottom: 5 }],
      placement: 'dock'
    }))
    controller.setViewport('Pane', { columns: 50, rows: 20 })
    await flush()
    emit({
      type: 'state',
      available: true,
      roster: { ...ROSTER, focused_id: 'hello-tabs' },
      statuses: {}
    })
    await flush()
    const pane = calls.find((call) => call.fields.instance_id === 'hello-tabs')
    expect(pane?.fields).toMatchObject({
      component: 'Pane',
      props: {
        title: 'Hello tabs',
        isFocused: true,
        bodyColumns: 44,
        placement: 'dock',
        scroll: { offset: 3, bodyRows: 10 },
        view: {}
      },
      content_rows: 30,
      keyed: [{ plugin: 'hello-tabs', key: 'tab-two', top: 4, bottom: 5 }],
      viewport: { columns: 50, rows: 20 }
    })
    const band = calls.find((call) => call.fields.instance_id === CLAUDE_MODS_BAND_ID)
    expect(band?.fields.props).toMatchObject({ hasSurvey: false, isWorking: false, maxRows: 12 })
    expect(band?.fields).not.toHaveProperty('content_rows')
  })

  it('hands scroll and focus pushes to sites through onPush', async () => {
    const { controller, emit } = harness(renderAnswer)
    const heard: string[] = []
    controller.onPush((event) => heard.push(event.type))
    emit({ type: 'scroll', push: { component: 'Pane', instance_id: 'hello-tabs', offset: 4 } })
    emit({ type: 'focus', push: { component: 'Pane', instance_id: 'hello-tabs', key: 'k' } })
    expect(heard).toEqual(['scroll', 'focus'])
  })

  it('rejects from requestStrict where request swallows and answers null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { controller } = harness(() => {
      throw new Error('boom')
    })
    await expect(controller.request('ui_client_module', { plugin: 'p' })).resolves.toBeNull()
    await expect(controller.requestStrict('ui_client_module', { plugin: 'p' })).rejects.toThrow(
      'boom'
    )
    warn.mockRestore()
  })
})
