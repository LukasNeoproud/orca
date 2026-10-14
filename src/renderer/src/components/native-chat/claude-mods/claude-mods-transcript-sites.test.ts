import { describe, expect, it } from 'vitest'
import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites'

type Call = { subtype: ClaudeModsRequestSubtype; fields: Record<string, unknown> }

const ENGINE = { type: 'engine', ref: 0 }
const HOOKED = {
  tree: { type: 'Text', children: ['x'] },
  props: {},
  rewritten: false,
  hooked: true
}
const UNHOOKED = { tree: ENGINE, props: {}, rewritten: false, hooked: false }
const EMPTY_ROSTER = { panes: [], shown_id: null, focused_id: null, focus_requested_id: null }

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** A controller whose `ui_render` answers wait for the test to release them. */
function harness(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  const waiting: (() => void)[] = []
  let gated = false
  let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype, fields) => {
        const call = { subtype, fields }
        calls.push(call)
        if (gated) {
          await new Promise<void>((resolve) => waiting.push(resolve))
        }
        return answer(call)
      },
      subscribe: async (handlers) => {
        emit = handlers.onEvent
        return { unsubscribe: () => {} }
      }
    },
    () => {}
  )
  controller.start()
  const sites = claudeModsTranscriptSites(controller)
  return {
    sites,
    calls,
    gate: () => {
      gated = true
    },
    release: async () => {
      waiting.splice(0).forEach((resolve) => resolve())
      await flush()
    },
    emit: (event: ClaudeModsSurfaceEvent) => emit(event)
  }
}

const ids = (calls: Call[]): unknown[] => calls.map((call) => call.fields.instance_id)

describe('ClaudeModsTranscriptSites', () => {
  it('asks once per site with its props and stores the answer', async () => {
    const { sites, calls } = harness(() => HOOKED)
    const changed: string[] = []
    sites.watch('ToolUse', 'toolu_1', () => changed.push('toolu_1'))
    sites.ask('ToolUse', 'toolu_1', { tool: 'Bash' })
    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.fields).toMatchObject({
      component: 'ToolUse',
      instance_id: 'toolu_1',
      props: { tool: 'Bash' }
    })
    expect(sites.getAnswer('ToolUse', 'toolu_1')?.hooked).toBe(true)
    expect(changed).toEqual(['toolu_1'])
  })

  it('coalesces asks for a site in flight into one follow-up with the latest props', async () => {
    const { sites, calls, gate, release } = harness(() => HOOKED)
    gate()
    sites.watch('AssistantMessage', 'm1', () => {})
    sites.ask('AssistantMessage', 'm1', { text: 'a' })
    sites.ask('AssistantMessage', 'm1', { text: 'ab' })
    sites.ask('AssistantMessage', 'm1', { text: 'abc' })
    await flush()
    expect(calls).toHaveLength(1)
    await release()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.fields.props).toEqual({ text: 'abc' })
  })

  it('stops asking a component no mod hooks, until an invalidate', async () => {
    const { sites, calls, emit } = harness(() => UNHOOKED)
    for (const id of ['a', 'b', 'c']) {
      sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
    }
    await flush()
    // The first answer is awaited before the rest of the component asks anything.
    expect(calls).toHaveLength(1)
    sites.ask('ToolUse', 'a', { changed: true })
    await flush()
    expect(calls).toHaveLength(1)
    emit({ type: 'invalidate' })
    await flush()
    expect(calls.length).toBeGreaterThan(1)
  })

  it('lets the rest of a hooked component ask once its first answer arrived', async () => {
    const { sites, calls, gate, release } = harness(() => HOOKED)
    gate()
    for (const id of ['a', 'b', 'c']) {
      sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
    }
    await flush()
    expect(ids(calls)).toEqual(['a'])
    await release()
    expect(ids(calls)).toEqual(['a', 'b', 'c'])
  })

  it('caps the asks in flight', async () => {
    const { sites, calls, gate, release } = harness(() => HOOKED)
    gate()
    // Distinct components so none waits on another's first answer.
    for (let index = 0; index < 6; index += 1) {
      sites.watch(`C${index}`, 'x', () => {})
      sites.ask(`C${index}`, 'x', {})
    }
    await flush()
    expect(calls).toHaveLength(4)
    await release()
    expect(calls).toHaveLength(6)
  })

  it('re-asks only the instances an invalidate names', async () => {
    const { sites, calls, emit } = harness(() => HOOKED)
    for (const id of ['a', 'b']) {
      sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
    }
    await flush()
    expect(calls).toHaveLength(2)
    emit({ type: 'invalidate', instances: ['b'] })
    await flush()
    expect(ids(calls)).toEqual(['a', 'b', 'b'])
    emit({ type: 'invalidate' })
    await flush()
    expect(calls).toHaveLength(5)
  })

  it('forgets everything on a new child and asks the mounted sites again', async () => {
    const { sites, calls, emit } = harness(() => HOOKED)
    sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', { n: 1 })
    await flush()
    expect(sites.getAnswer('ToolUse', 'a')).not.toBeNull()
    emit({
      type: 'state',
      available: false,
      roster: EMPTY_ROSTER,
      statuses: {}
    })
    expect(sites.getAnswer('ToolUse', 'a')).toBeNull()
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.fields.props).toEqual({ n: 1 })
  })

  it('drops an answer that predates a new child', async () => {
    const { sites, gate, release, emit } = harness(() => HOOKED)
    gate()
    sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    emit({ type: 'state', available: false, roster: EMPTY_ROSTER, statuses: {} })
    await release()
    expect(sites.getAnswer('ToolUse', 'a')).toBeNull()
  })

  it('stops asking about a site once it unmounts', async () => {
    const { sites, calls, gate, release } = harness(() => HOOKED)
    gate()
    const unwatch = sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    unwatch()
    await release()
    expect(sites.getAnswer('ToolUse', 'a')).toBeNull()
    sites.ask('ToolUse', 'a', {})
    await flush()
    expect(calls).toHaveLength(1)
  })

  it('treats a failed ask as unhooked rather than repeating it', async () => {
    const { sites, calls } = harness(() => null)
    for (const id of ['a', 'b']) {
      sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
    }
    await flush()
    expect(calls).toHaveLength(1)
  })

  it('sends presses of a drawn tree as that site, and asks again when the handle is retired', async () => {
    const { sites, calls } = harness((call) =>
      call.subtype === 'ui_render' ? HOOKED : { handled: false }
    )
    sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    sites.dispatch('ToolUse', 'a').press({ plugin: 'p', handle: 7 }, 'k')
    await flush()
    expect(calls.map((call) => call.subtype)).toEqual(['ui_render', 'ui_press', 'ui_render'])
    expect(calls[1]?.fields).toEqual({ plugin: 'p', handle: 7, key: 'k' })
    expect(calls[2]?.fields.component).toBe('ToolUse')
  })

  it('re-asks hooked sites when the columns change', async () => {
    const { sites, calls } = harness(() => HOOKED)
    sites.setViewport({ columns: 80, rows: 24 })
    sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    expect(calls[0]?.fields.viewport).toEqual({ columns: 80, rows: 24 })
    sites.setViewport({ columns: 80, rows: 30 })
    await flush()
    expect(calls).toHaveLength(1)
    sites.setViewport({ columns: 100, rows: 30 })
    await flush()
    expect(calls).toHaveLength(2)
  })
})
