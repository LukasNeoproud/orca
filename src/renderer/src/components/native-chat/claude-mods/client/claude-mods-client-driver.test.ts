import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeModsSurfaceEvent } from '../../../../../../shared/claude-mods-surface'
import type { ClaudeModsClientWorkerFactory } from './claude-mods-client-frame'
import { ClaudeModsClientFrames } from './claude-mods-client-frames'
import { ClaudeModsClientDriver, type ClaudeModsClientSpec } from './claude-mods-client-driver'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type FakeWorker = {
  ops: string[]
  calls: Record<string, unknown>[]
  terminated: boolean
  /** Ops that never answer, as a runaway module would. */
  hang: Set<string>
  signal: (message: Record<string, unknown>) => void
}

/** An in-process stand-in for the worker: answers every call, draws one Go button. */
function fakeWorkers(): { factory: ClaudeModsClientWorkerFactory; workers: FakeWorker[] } {
  const workers: FakeWorker[] = []
  const factory: ClaudeModsClientWorkerFactory = ({ onMessage }) => {
    let held = 0
    const worker: FakeWorker = {
      ops: [],
      calls: [],
      terminated: false,
      hang: new Set(),
      signal: (message) => onMessage(message)
    }
    workers.push(worker)
    return {
      postMessage: (message) => {
        if (!isRecord(message) || typeof message.op !== 'string') {
          return
        }
        worker.ops.push(message.op)
        worker.calls.push(message)
        if (message.op === 'dropHeld' || worker.hang.has(message.op)) {
          return
        }
        const value =
          message.op === 'render'
            ? JSON.stringify({
                type: 'Box',
                children: [{ type: 'Button', props: { key: 'go', label: 'Go' }, held: ++held }]
              })
            : undefined
        queueMicrotask(() =>
          onMessage({
            type: 'answer',
            seq: message.seq,
            ok: true,
            value,
            listeners: { key: true, pointer: false }
          })
        )
      },
      terminate: () => {
        worker.terminated = true
      }
    }
  }
  return { factory, workers }
}

const MODULE_ANSWER = {
  plugin: 'board',
  hash: 'h1',
  modules: [
    { module: 'hooks/board.jsx', entry: 'surface:///hooks/board.jsx', component: 'default' }
  ],
  runtime: 'claude:surface-runtime',
  limits: { nodes: 100, depth: 8, chars: 10_000, values: 100, dataDepth: 8 },
  files: [
    { key: 'claude:surface-runtime', source: 'export const install = () => ({})' },
    { key: 'surface:///hooks/board.jsx', source: 'export default () => "x"' }
  ]
}

type Request = { subtype: string; fields: Record<string, unknown> }

function harness(
  answers: Partial<Record<string, (fields: Record<string, unknown>) => unknown>> = {}
) {
  const requests: Request[] = []
  const pushes = new Set<(event: ClaudeModsSurfaceEvent) => void>()
  const request = async (subtype: string, fields: Record<string, unknown>): Promise<unknown> => {
    requests.push({ subtype, fields })
    const answer = answers[subtype]
    if (answer) {
      return answer(fields)
    }
    return subtype === 'ui_client_module' ? MODULE_ANSWER : null
  }
  const { factory, workers } = fakeWorkers()
  const frames = new ClaudeModsClientFrames(
    {
      request,
      onPush: (listener) => {
        pushes.add(listener)
        return () => pushes.delete(listener)
      }
    },
    factory
  )
  const redraws: string[] = []
  const driver = (): ClaudeModsClientDriver =>
    new ClaudeModsClientDriver(frames, request, (id) => redraws.push(id))
  return { requests, workers, frames, driver, redraws, pushes }
}

const spec = (overrides: Partial<ClaudeModsClientSpec> = {}): ClaudeModsClientSpec => ({
  address: {
    plugin: 'board',
    component: 'Pane',
    instance_id: 'board',
    client: 'b1',
    module: 'hooks/board.jsx'
  },
  hash: 'h1',
  loaded: true,
  props: { n: 1 },
  ...overrides
})

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await vi.advanceTimersByTimeAsync(0)
  }
}

function drawnButtonHandle(driver: ClaudeModsClientDriver): number {
  const view = driver.getView()
  if (view.kind !== 'drawn' || view.tree.kind !== 'element') {
    throw new Error(`not drawn: ${view.kind}`)
  }
  const button = view.tree.children[0]
  if (button?.kind !== 'element' || !button.press) {
    throw new Error('no button')
  }
  return button.press.handle
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ClaudeModsClientDriver', () => {
  it('loads the plugin once, mounts, sizes and draws the Client', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    expect(driver.getView()).toMatchObject({ kind: 'drawn', listeners: { key: true } })
    expect(h.workers[0]?.ops).toEqual(['load', 'mount', 'resize', 'render'])
    expect(h.workers[0]?.calls[1]).toMatchObject({
      entry: 'surface:///hooks/board.jsx',
      props: { n: 1 }
    })
    expect(h.workers[0]?.calls[2]).toMatchObject({ columns: 40, rows: 6 })
    const second = h.driver()
    second.resize({ columns: 10, rows: 2, auto: false })
    second.update(spec({ address: { ...spec().address, client: 'b2' } }))
    await settle()
    expect(h.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(1)
    expect(h.workers).toHaveLength(1)
  })

  it('sends a press with the Client address and runs the closure with what reached it', async () => {
    const reached = { plugin: 'board', element: 'go', component: 'Pane', requestId: 'board' }
    const h = harness({ ui_client_press: () => ({ handled: true, reached }) })
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const handle = drawnButtonHandle(driver)
    driver.dispatch.press({ plugin: 'board', handle }, 'go')
    await settle()
    expect(h.requests.at(-1)).toEqual({
      subtype: 'ui_client_press',
      fields: { ...spec().address, element: 'go', event: { type: 'press' } }
    })
    expect(h.workers[0]?.calls.at(-1)).toMatchObject({
      op: 'act',
      kind: 'held',
      payload: { handle, event: reached }
    })
  })

  it('asks the site again when a press finds the Client gone', async () => {
    const h = harness({ ui_client_press: () => ({ handled: false }) })
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    await driver.dispatch.input({ plugin: 'board', handle: 1 }, 'name', 'submit', 'hi')
    await settle()
    expect(h.redraws).toEqual(['board'])
  })

  it('coalesces posts to one ui_message a frame and applies the answered props', async () => {
    const h = harness({ ui_message: () => ({ handled: true, props: { n: 2 } }) })
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    const id = worker?.calls[1]?.id
    worker?.signal({ type: 'post', id, text: '{"a":1}' })
    worker?.signal({ type: 'post', id, text: '{"a":2}' })
    await vi.advanceTimersByTimeAsync(20)
    await settle()
    const messages = h.requests.filter((r) => r.subtype === 'ui_message')
    expect(messages).toEqual([
      { subtype: 'ui_message', fields: { ...spec().address, data: { a: 2 } } }
    ])
    expect(worker?.calls.find((call) => call.op === 'setProps')).toMatchObject({ props: { n: 2 } })
  })

  it('faults a render that overruns its budget and retries only on new props', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    worker?.hang.add('render')
    driver.update(spec({ props: { n: 5 } }))
    await vi.advanceTimersByTimeAsync(1001)
    await settle()
    expect(worker?.terminated).toBe(true)
    expect(driver.getView()).toEqual({
      kind: 'fault',
      line: 'board: Client hooks/board.jsx: ran longer than its 1000ms budget'
    })
    expect(h.requests.filter((r) => r.subtype === 'ui_client_fault')).toEqual([
      {
        subtype: 'ui_client_fault',
        fields: { ...spec().address, phase: 'render', reason: 'ran longer than its 1000ms budget' }
      }
    ])
    driver.update(spec({ props: { n: 5 } }))
    await settle()
    expect(h.workers).toHaveLength(1)
    driver.update(spec({ props: { n: 6 } }))
    await settle()
    expect(h.workers).toHaveLength(2)
    expect(driver.getView().kind).toBe('drawn')
  })

  it('unmounts a module that sets state on every render', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    const id = worker?.calls[1]?.id
    for (let round = 0; round < 3; round += 1) {
      worker?.signal({ type: 'schedule', id })
      await settle()
    }
    expect(driver.getView()).toMatchObject({ kind: 'fault' })
    expect(h.requests.at(-1)?.fields).toMatchObject({ phase: 'run' })
    expect(worker?.ops.at(-1)).toBe('unmount')
  })

  it('draws the notice without a fault when the host serves no modules', async () => {
    const h = harness({ ui_client_module: () => null })
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    expect(driver.getView()).toEqual({ kind: 'unsupported' })
    expect(h.requests.some((r) => r.subtype === 'ui_client_fault')).toBe(false)
  })

  it('faults a Client whose plugin the drawing says has no surface module', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec({ loaded: false, hash: undefined }))
    await settle()
    expect(driver.getView()).toMatchObject({ kind: 'fault' })
    expect(h.requests.map((r) => r.subtype)).toEqual(['ui_client_fault'])
  })

  it('remounts every Client of a plugin on a new hash', async () => {
    const h = harness()
    const first = h.driver()
    const second = h.driver()
    for (const driver of [first, second]) {
      driver.resize({ columns: 40, rows: 6, auto: false })
    }
    first.update(spec())
    second.update(spec({ address: { ...spec().address, client: 'b2' } }))
    await settle()
    first.update(spec({ hash: 'h2' }))
    await settle()
    expect(h.workers[0]?.terminated).toBe(true)
    expect(h.workers).toHaveLength(2)
    expect(h.workers[1]?.ops.filter((op) => op === 'mount')).toHaveLength(2)
    expect(second.getView().kind).toBe('drawn')
  })

  it('terminates the workers when the session child changes', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    for (const listener of h.pushes) {
      listener({
        type: 'state',
        available: true,
        roster: { panes: [], shown_id: null, focused_id: null, focus_requested_id: null },
        statuses: {}
      })
    }
    await settle()
    expect(h.workers[0]?.terminated).toBe(true)
    expect(h.workers).toHaveLength(2)
    driver.dispose()
    await vi.advanceTimersByTimeAsync(10_001)
    expect(h.workers[1]?.terminated).toBe(true)
  })
})
