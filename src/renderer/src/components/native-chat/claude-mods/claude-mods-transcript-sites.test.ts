import { describe, expect, it } from 'vitest'
import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import { MAX_CLAUDE_MODS_REQUEST_BYTES } from '../../../../../shared/rpc-contract/claude-mods-surface-params'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites-registry'

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

  it('does not show a reply for props the row flipped back from while it was in flight', async () => {
    const { sites, calls, gate, release } = harness((call) => ({
      ...HOOKED,
      props: call.fields.props
    }))
    sites.watch('ToolGroup', 'g', () => {})
    sites.ask('ToolGroup', 'g', { isExpanded: false })
    await flush()
    gate()
    sites.ask('ToolGroup', 'g', { isExpanded: true })
    await flush()
    sites.ask('ToolGroup', 'g', { isExpanded: false })
    await release()
    await release()
    expect(sites.getAnswer('ToolGroup', 'g')?.props).toEqual({ isExpanded: false })
    expect(calls.at(-1)?.fields.props).toEqual({ isExpanded: false })
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

  it('lets the rest of a component ask after one ask failed, and stops after three in a row', async () => {
    const { sites, calls } = harness(() => null)
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
    }
    await flush()
    expect(ids(calls)).toEqual(['a', 'b', 'c'])
    expect(sites.isUnhooked('ToolUse')).toBe(true)
  })

  it('does not take a component for unhooked because one ask failed', async () => {
    let failing = true
    const { sites, calls } = harness(() => (failing ? null : HOOKED))
    sites.watch('UserMessage', 'big', () => {})
    sites.ask('UserMessage', 'big', {})
    await flush()
    failing = false
    sites.watch('UserMessage', 'other', () => {})
    sites.ask('UserMessage', 'other', {})
    await flush()
    expect(ids(calls)).toEqual(['big', 'other'])
    expect(sites.getAnswer('UserMessage', 'other')?.hooked).toBe(true)
  })

  it('sends an oversized ask trimmed to the host bound, and keeps the original text for the row', async () => {
    const { sites, calls } = harness(() => ({ ...HOOKED, props: {} }))
    sites.watch('UserMessage', 'u', () => {})
    sites.ask('UserMessage', 'u', { text: 'x'.repeat(300_000), isExpanded: true })
    await flush()
    const sent = calls[0]?.fields.props
    expect(JSON.stringify(calls[0]?.fields).length).toBeLessThan(MAX_CLAUDE_MODS_REQUEST_BYTES)
    expect(sent).toMatchObject({ isExpanded: true })
    expect(sites.getAnswer('UserMessage', 'u')?.hooked).toBe(true)
  })

  it('hands a cut text back whole when the mod passed it through unchanged', async () => {
    const text = 'x'.repeat(300_000)
    const { sites } = harness((call) => ({
      ...HOOKED,
      rewritten: true,
      props: { text: Reflect.get(Object(call.fields.props), 'text') }
    }))
    sites.watch('UserMessage', 'u', () => {})
    sites.ask('UserMessage', 'u', { text })
    await flush()
    expect(sites.getAnswer('UserMessage', 'u')?.props.text).toBe(text)
  })

  it('forgets nobody-hooks-this for components with no mounted site on a global invalidate', async () => {
    const { sites, emit } = harness(() => UNHOOKED)
    const unwatch = sites.watch('Spinner', 'main', () => {})
    sites.ask('Spinner', 'main', {})
    await flush()
    unwatch()
    expect(sites.isUnhooked('Spinner')).toBe(true)
    let notified = 0
    sites.subscribeHooked(() => (notified += 1))
    emit({ type: 'invalidate' })
    expect(sites.isUnhooked('Spinner')).toBe(false)
    expect(notified).toBe(1)
  })

  it('keeps the unhooked memory of other components when an invalidate names instances', async () => {
    const { sites, emit } = harness(() => UNHOOKED)
    const unwatch = sites.watch('Spinner', 'main', () => {})
    sites.ask('Spinner', 'main', {})
    await flush()
    unwatch()
    sites.watch('ToolUse', 't', () => {})
    emit({ type: 'invalidate', instances: ['t'] })
    expect(sites.isUnhooked('Spinner')).toBe(true)
  })

  it('draws a remounted row from its last answer without asking again', async () => {
    const { sites, calls } = harness(() => HOOKED)
    sites.setViewport({ columns: 80, rows: 24 })
    const unwatch = sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', { tool: 'Bash' })
    await flush()
    unwatch()
    // Before the effect watches it again, the render already finds the answer.
    expect(sites.getAnswer('ToolUse', 'a')?.hooked).toBe(true)
    sites.watch('ToolUse', 'a', () => {})
    expect(sites.getAnswer('ToolUse', 'a')?.hooked).toBe(true)
    sites.ask('ToolUse', 'a', { tool: 'Bash' })
    await flush()
    expect(calls).toHaveLength(1)
    sites.ask('ToolUse', 'a', { tool: 'Bash', isErrored: true })
    await flush()
    expect(calls).toHaveLength(2)
  })

  it('forgets remembered answers on an invalidate', async () => {
    const { sites, emit } = harness(() => HOOKED)
    sites.setViewport({ columns: 80, rows: 24 })
    for (const id of ['a', 'b']) {
      const unwatch = sites.watch('ToolUse', id, () => {})
      sites.ask('ToolUse', id, {})
      await flush()
      unwatch()
    }
    expect(sites.getAnswer('ToolUse', 'a')?.hooked).toBe(true)
    emit({ type: 'invalidate', instances: ['a'] })
    expect(sites.getAnswer('ToolUse', 'a')).toBeNull()
    expect(sites.getAnswer('ToolUse', 'b')?.hooked).toBe(true)
    emit({ type: 'invalidate' })
    expect(sites.getAnswer('ToolUse', 'b')).toBeNull()
  })

  it('forgets remembered answers when a new child starts', async () => {
    const { sites, emit } = harness(() => HOOKED)
    sites.setViewport({ columns: 80, rows: 24 })
    const unwatch = sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    unwatch()
    emit({ type: 'state', available: true, roster: EMPTY_ROSTER, statuses: {} })
    expect(sites.getAnswer('ToolUse', 'a')).toBeNull()
  })

  it('bounds the answers it remembers', async () => {
    const { sites } = harness(() => HOOKED)
    sites.setViewport({ columns: 80, rows: 24 })
    for (let index = 0; index < 260; index += 1) {
      const unwatch = sites.watch('ToolUse', `t${index}`, () => {})
      sites.ask('ToolUse', `t${index}`, {})
      await flush()
      unwatch()
    }
    expect(sites.getAnswer('ToolUse', 't0')).toBeNull()
    expect(sites.getAnswer('ToolUse', 't259')?.hooked).toBe(true)
  })

  it('asks again with the column once it is known, for answers drawn without it', async () => {
    const { sites, calls } = harness(() => HOOKED)
    sites.watch('ToolUse', 'a', () => {})
    sites.ask('ToolUse', 'a', {})
    await flush()
    expect(calls[0]?.fields.viewport).toBeUndefined()
    sites.setViewport({ columns: 90, rows: 20 })
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.fields.viewport).toEqual({ columns: 90, rows: 20 })
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
