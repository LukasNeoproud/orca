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
  /** Ops that run forever once begun, as a runaway module would. */
  hang: Set<string>
  /** How long an op runs once begun; the worker runs one call at a time. */
  runMs: Partial<Record<string, number>>
  /** Never begins another call, as a worker stuck outside any call would. */
  stuck: boolean
  /** What a render throws instead of drawing. */
  throwOnRender?: string
  signal: (message: Record<string, unknown>) => void
}

/** An in-process stand-in for the worker: runs calls one at a time, draws one Go button. */
function fakeWorkers(): { factory: ClaudeModsClientWorkerFactory; workers: FakeWorker[] } {
  const workers: FakeWorker[] = []
  const factory: ClaudeModsClientWorkerFactory = ({ onMessage }) => {
    let held = 0
    let busy = false
    const queue: Record<string, unknown>[] = []
    const worker: FakeWorker = {
      ops: [],
      calls: [],
      terminated: false,
      hang: new Set(),
      runMs: {},
      stuck: false,
      signal: (message) => onMessage(message)
    }
    workers.push(worker)
    const answer = (message: Record<string, unknown>): void => {
      if (worker.terminated) {
        return
      }
      const op = String(message.op)
      const value =
        op === 'render'
          ? JSON.stringify({
              type: 'Box',
              children: [{ type: 'Button', props: { key: 'go', label: 'Go' }, held: ++held }]
            })
          : undefined
      onMessage(
        op === 'render' && worker.throwOnRender !== undefined
          ? { type: 'answer', seq: message.seq, ok: false, reason: worker.throwOnRender }
          : {
              type: 'answer',
              seq: message.seq,
              ok: true,
              value,
              listeners: { key: true, pointer: false }
            }
      )
      busy = false
      next()
    }
    const next = (): void => {
      if (busy || worker.terminated || worker.stuck) {
        return
      }
      const message = queue.shift()
      if (!message) {
        return
      }
      busy = true
      onMessage({ type: 'begin', seq: message.seq })
      const op = String(message.op)
      if (worker.hang.has(op)) {
        return
      }
      const ms = worker.runMs[op] ?? 0
      if (ms > 0) {
        setTimeout(() => answer(message), ms)
      } else {
        queueMicrotask(() => answer(message))
      }
    }
    return {
      postMessage: (message) => {
        if (!isRecord(message) || typeof message.op !== 'string') {
          return
        }
        worker.ops.push(message.op)
        worker.calls.push(message)
        if (message.op === 'dropHeld') {
          return
        }
        queue.push(message)
        if (!busy) {
          queueMicrotask(next)
        }
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
      requestStrict: request,
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

  it('times a call from when the worker begins it, not while it waits behind others', async () => {
    const h = harness()
    const drivers = [h.driver(), h.driver(), h.driver()]
    drivers.forEach((driver, index) => {
      driver.resize({ columns: 40, rows: 6, auto: false })
      driver.update(spec({ address: { ...spec().address, client: `b${index}` } }))
    })
    await settle()
    const worker = h.workers[0]
    if (worker) {
      worker.runMs.render = 600
    }
    drivers.forEach((driver, index) =>
      driver.update(spec({ address: { ...spec().address, client: `b${index}` }, props: { n: 2 } }))
    )
    await vi.advanceTimersByTimeAsync(2500)
    await settle()
    expect(worker?.terminated).toBe(false)
    expect(drivers.map((driver) => driver.getView().kind)).toEqual(['drawn', 'drawn', 'drawn'])
    expect(h.requests.some((r) => r.subtype === 'ui_client_fault')).toBe(false)
  })

  it('faults only the Client whose call overran and remounts the rest in a fresh worker', async () => {
    const h = harness()
    const culprit = h.driver()
    const neighbour = h.driver()
    for (const driver of [culprit, neighbour]) {
      driver.resize({ columns: 40, rows: 6, auto: false })
    }
    culprit.update(spec())
    neighbour.update(spec({ address: { ...spec().address, client: 'b2' } }))
    await settle()
    h.workers[0]?.hang.add('render')
    culprit.update(spec({ props: { n: 9 } }))
    await vi.advanceTimersByTimeAsync(1001)
    await settle()
    expect(culprit.getView()).toMatchObject({ kind: 'fault' })
    expect(neighbour.getView().kind).toBe('drawn')
    expect(h.workers).toHaveLength(2)
    expect(h.workers[1]?.ops).toEqual(['load', 'mount', 'resize', 'render'])
    expect(h.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(1)
    expect(h.requests.filter((r) => r.subtype === 'ui_client_fault')).toEqual([
      {
        subtype: 'ui_client_fault',
        fields: { ...spec().address, phase: 'render', reason: 'ran longer than its 1000ms budget' }
      }
    ])
  })

  it('reads no stall into a call posted after a long quiet spell', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    await vi.advanceTimersByTimeAsync(4900)
    driver.update(spec({ props: { n: 7 } }))
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    expect(h.workers[0]?.terminated).toBe(false)
    expect(driver.getView().kind).toBe('drawn')
  })

  it('waits once more when a renderer stall fires a budget late', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    if (worker) {
      worker.runMs.render = 1100
    }
    driver.update(spec({ props: { n: 8 } }))
    await vi.advanceTimersByTimeAsync(999)
    vi.setSystemTime(Date.now() + 2000)
    await vi.advanceTimersByTimeAsync(150)
    await settle()
    expect(worker?.terminated).toBe(false)
    expect(driver.getView().kind).toBe('drawn')
  })

  it('faults every Client when the worker stops beginning calls', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    if (worker) {
      worker.stuck = true
    }
    driver.update(spec({ props: { n: 3 } }))
    await vi.advanceTimersByTimeAsync(4000)
    expect(driver.getView().kind).toBe('drawn')
    await vi.advanceTimersByTimeAsync(1001)
    await settle()
    expect(worker?.terminated).toBe(true)
    expect(driver.getView()).toEqual({
      kind: 'fault',
      line: 'board: Client hooks/board.jsx: its frame stopped answering'
    })
  })

  it('draws a bounded single line for a reason the module throws at any size', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    const worker = h.workers[0]
    if (worker) {
      worker.throwOnRender = `boom\n${'x'.repeat(100_000)}`
    }
    driver.update(spec({ props: { n: 4 } }))
    await settle()
    const view = driver.getView()
    expect(view.kind).toBe('fault')
    expect(view.kind === 'fault' && view.line.length).toBeLessThan(260)
    expect(view.kind === 'fault' && view.line).toMatch(/^board: Client hooks\/board\.jsx: boom x+$/)
  })

  it('starts no worker and sends no request once its frames are closed', async () => {
    const h = harness()
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    h.frames.close()
    await settle()
    const late = h.driver()
    late.resize({ columns: 40, rows: 6, auto: false })
    late.update(spec({ address: { ...spec().address, client: 'b2' } }))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(h.workers).toHaveLength(1)
    expect(h.workers[0]?.terminated).toBe(true)
    expect(h.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(1)
  })

  it('asks again after a backoff when ui_client_module once answered nothing', async () => {
    let calls = 0
    const h = harness({ ui_client_module: () => (++calls === 1 ? null : MODULE_ANSWER) })
    const driver = h.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await settle()
    expect(driver.getView()).toEqual({ kind: 'unsupported' })
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(driver.getView().kind).toBe('drawn')
  })

  it('gives up after a few unanswered asks, and at once when the subtype is refused', async () => {
    const silent = harness({ ui_client_module: () => null })
    const driver = silent.driver()
    driver.resize({ columns: 40, rows: 6, auto: false })
    driver.update(spec())
    await vi.advanceTimersByTimeAsync(300_000)
    expect(silent.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(5)
    expect(driver.getView()).toEqual({ kind: 'unsupported' })
    const refusing = harness({
      ui_client_module: () => {
        throw new Error('Unsupported control request subtype: ui_client_module')
      }
    })
    const first = refusing.driver()
    first.resize({ columns: 40, rows: 6, auto: false })
    first.update(spec())
    await vi.advanceTimersByTimeAsync(300_000)
    const second = refusing.driver()
    second.resize({ columns: 40, rows: 6, auto: false })
    second.update(spec({ address: { ...spec().address, client: 'b2' }, hash: 'h2' }))
    await settle()
    expect(refusing.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(1)
    expect(second.getView()).toEqual({ kind: 'unsupported' })
  })

  it('retries after a timeout that names the subtype instead of reading it as a refusal', async () => {
    let calls = 0
    const slow = harness({
      ui_client_module: () => {
        calls += 1
        if (calls === 1) {
          throw new Error('claude ui_client_module request timed out')
        }
        return undefined
      }
    })
    const client = slow.driver()
    client.resize({ columns: 40, rows: 6, auto: false })
    client.update(spec())
    await vi.advanceTimersByTimeAsync(2_000)
    await settle()
    expect(slow.requests.filter((r) => r.subtype === 'ui_client_module').length).toBeGreaterThan(1)
  })

  it('reads a refusal from the error naming the params enum, not from any validation error', async () => {
    const enumRefusal = harness({
      ui_client_module: () => {
        throw new Error('Invalid option: expected one of "ui_render"|"ui_press"')
      }
    })
    const old = enumRefusal.driver()
    old.resize({ columns: 40, rows: 6, auto: false })
    old.update(spec())
    await settle()
    expect(old.getView()).toEqual({ kind: 'unsupported' })
    const next = enumRefusal.driver()
    next.resize({ columns: 40, rows: 6, auto: false })
    next.update(spec({ address: { ...spec().address, plugin: 'other' }, hash: 'h9' }))
    await vi.advanceTimersByTimeAsync(300_000)
    expect(enumRefusal.requests.filter((r) => r.subtype === 'ui_client_module')).toHaveLength(1)
    // One plugin's own validation error names neither: the next plugin is still asked.
    const picky = harness({
      ui_client_module: (fields) => {
        if (fields.plugin === 'bad') {
          throw new Error('Invalid input: expected string, received undefined')
        }
        return MODULE_ANSWER
      }
    })
    const bad = picky.driver()
    bad.resize({ columns: 40, rows: 6, auto: false })
    bad.update(spec({ address: { ...spec().address, plugin: 'bad' } }))
    await settle()
    const good = picky.driver()
    good.resize({ columns: 40, rows: 6, auto: false })
    good.update(spec())
    await settle()
    expect(good.getView().kind).toBe('drawn')
  })

  it('reports an unmount that overran, and the neighbours still remount', async () => {
    const h = harness()
    const leaving = h.driver()
    const neighbour = h.driver()
    for (const driver of [leaving, neighbour]) {
      driver.resize({ columns: 40, rows: 6, auto: false })
    }
    leaving.update(spec())
    neighbour.update(spec({ address: { ...spec().address, client: 'b2' } }))
    await settle()
    h.workers[0]?.hang.add('unmount')
    leaving.dispose()
    await vi.advanceTimersByTimeAsync(1001)
    await settle()
    expect(neighbour.getView().kind).toBe('drawn')
    expect(h.workers).toHaveLength(2)
    expect(h.requests.filter((r) => r.subtype === 'ui_client_fault')).toEqual([
      {
        subtype: 'ui_client_fault',
        fields: {
          ...spec().address,
          phase: 'run',
          reason: 'unmounting ran longer than its 1000ms budget'
        }
      }
    ])
  })
})
