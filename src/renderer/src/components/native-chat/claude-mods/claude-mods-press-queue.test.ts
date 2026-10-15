import { describe, expect, it, vi } from 'vitest'
import {
  ClaudeModsPressQueue,
  claudeModsCurrentPress,
  claudeModsPressQueueFor,
  type ClaudeModsActSite
} from './claude-mods-press-queue'
import { readClaudeModsTree, type ClaudeModsNode } from './claude-mods-tree'

type Call = { subtype: string; fields: Record<string, unknown> }

function deferredSend(): {
  send: (subtype: string, fields: Record<string, unknown>) => Promise<unknown>
  calls: Call[]
  settle: (answer?: unknown) => void
} {
  const calls: Call[] = []
  const pending: ((answer: unknown) => void)[] = []
  return {
    calls,
    send: (subtype, fields) => {
      calls.push({ subtype, fields })
      return new Promise((resolve) => pending.push(resolve))
    },
    settle: (answer = { handled: true }) => pending.shift()?.(answer)
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function tree(handle: number, extra: unknown[] = []): ClaudeModsNode {
  return readClaudeModsTree({
    type: 'Box',
    children: [
      {
        type: 'Button',
        props: { key: 'go', label: 'Go' },
        press: { plugin: 'demo', handle }
      },
      ...extra
    ]
  })
}

function site(latest: ClaudeModsNode | undefined, onRetired = vi.fn()): ClaudeModsActSite {
  return { id: 'Pane\0demo', latest: () => latest, onRetired }
}

describe('ClaudeModsPressQueue', () => {
  it('drops a second press of the same element while the first is in flight', async () => {
    const transport = deferredSend()
    const queue = new ClaudeModsPressQueue(transport.send)
    const target = site(tree(7))
    queue.press(target, { plugin: 'demo', handle: 7 }, 'go')
    queue.press(target, { plugin: 'demo', handle: 7 }, 'go')
    await flush()
    expect(transport.calls).toHaveLength(1)
    transport.settle()
    await flush()
    queue.press(target, { plugin: 'demo', handle: 7 }, 'go')
    await flush()
    expect(transport.calls).toHaveLength(2)
  })

  it('sends a press on a superseded drawing with the newest handle for its key', async () => {
    const transport = deferredSend()
    const queue = new ClaudeModsPressQueue(transport.send)
    queue.press(site(tree(9)), { plugin: 'demo', handle: 3 }, 'go')
    await flush()
    expect(transport.calls[0]).toEqual({
      subtype: 'ui_press',
      fields: { plugin: 'demo', handle: 9, key: 'go' }
    })
  })

  it('keeps the drawn handle when the key is not unique or not given', async () => {
    const transport = deferredSend()
    const queue = new ClaudeModsPressQueue(transport.send)
    const twice = tree(9, [
      { type: 'Button', props: { key: 'go' }, press: { plugin: 'demo', handle: 10 } }
    ])
    queue.press(site(twice), { plugin: 'demo', handle: 3 }, 'go')
    queue.press(site(tree(9)), { plugin: 'demo', handle: 4 })
    await flush()
    expect(transport.calls.map((call) => call.fields.handle).sort()).toEqual([3, 4])
  })

  it('redraws the site when the engine ran nothing', async () => {
    const transport = deferredSend()
    const onRetired = vi.fn()
    new ClaudeModsPressQueue(transport.send).press(
      site(undefined, onRetired),
      { plugin: 'demo', handle: 1 },
      'go'
    )
    await flush()
    transport.settle({ handled: false })
    await flush()
    expect(onRetired).toHaveBeenCalledOnce()
  })

  it('folds changes waiting behind one in flight and keeps submits in order', async () => {
    const transport = deferredSend()
    const queue = new ClaudeModsPressQueue(transport.send)
    const target = site(undefined)
    const field = { press: { plugin: 'demo', handle: 2 }, key: 'name' }
    const send = (kind: 'change' | 'submit', value: string): Promise<void> =>
      queue.queue(target, 'ui_input', field, kind === 'change', { kind, value })
    void send('change', 'a')
    const folded = send('change', 'ab')
    void send('change', 'abc')
    void send('submit', 'abc')
    void send('change', 'abcd')
    await folded
    for (let i = 0; i < 4; i += 1) {
      await flush()
      transport.settle()
    }
    await flush()
    expect(transport.calls.map((call) => call.fields)).toEqual([
      { kind: 'change', value: 'a' },
      { kind: 'change', value: 'abc' },
      { kind: 'submit', value: 'abc' },
      { kind: 'change', value: 'abcd' }
    ])
  })

  it('shares one queue between every dispatch on a transport', () => {
    const transport = { request: vi.fn(async () => ({ handled: true })) }
    expect(claudeModsPressQueueFor(transport)).toBe(claudeModsPressQueueFor(transport))
  })
})

describe('claudeModsCurrentPress', () => {
  it('finds Markdown presses by key and ignores other plugins', () => {
    const drawn = readClaudeModsTree({
      type: 'Box',
      children: [
        { type: 'Markdown', props: { key: 'doc' }, press: { plugin: 'demo', handle: 5 } },
        { type: 'Button', props: { key: 'go' }, press: { plugin: 'other', handle: 6 } }
      ]
    })
    expect(claudeModsCurrentPress(drawn, 'demo', 'doc')).toEqual({ plugin: 'demo', handle: 5 })
    expect(claudeModsCurrentPress(drawn, 'demo', 'go')).toBeUndefined()
  })
})
