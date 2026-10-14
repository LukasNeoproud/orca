// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import {
  claudeModsControlAttributes,
  ClaudeModsFocusSync,
  isClaudeModsFocusWithinSite
} from './claude-mods-focus-sync'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function control(
  tag: 'button' | 'input',
  key: string,
  plugin: string,
  autoFocus = false
): HTMLElement {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(claudeModsControlAttributes(key, plugin, autoFocus))) {
    if (value !== undefined) {
      element.setAttribute(name, value)
    }
  }
  return element
}

function harness(answer: (fields: Record<string, unknown>) => unknown = () => null) {
  const requests: Record<string, unknown>[] = []
  const container = document.createElement('div')
  container.tabIndex = -1
  const outside = document.createElement('button')
  document.body.append(container, outside)
  const yes = control('button', 'yes', 'ask', true)
  const no = control('button', 'no', 'ask')
  const note = control('input', 'note', 'ask')
  container.append(yes, no, note)
  const sync = new ClaudeModsFocusSync(
    {
      component: 'Pane',
      instanceId: 'ask',
      request: async (fields) => {
        requests.push(fields)
        return answer(fields)
      }
    },
    container
  )
  const detach = sync.attach()
  return { sync, requests, container, outside, yes, no, note, detach }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ClaudeModsFocusSync', () => {
  it('tells the engine the site holds the keyboard, with the control the person focused', async () => {
    const { requests, no, outside } = harness()
    no.focus()
    await flush()
    expect(requests).toEqual([
      {
        component: 'Pane',
        instance_id: 'ask',
        is_held: true,
        element: { plugin: 'ask', key: 'no' },
        by: 'person'
      }
    ])
    outside.focus()
    await flush()
    expect(requests[1]).toEqual({ component: 'Pane', instance_id: 'ask', is_held: false })
  })

  it('moves only the ring while the keyboard stays inside the site', async () => {
    const { requests, yes, no } = harness()
    yes.focus()
    no.focus()
    await flush()
    expect(requests.map((request) => [request.is_held, request.element])).toEqual([
      [true, { plugin: 'ask', key: 'yes' }],
      [true, { plugin: 'ask', key: 'no' }]
    ])
  })

  it('reports the hold alone when the container itself is focused after a control', async () => {
    const { requests, container, yes } = harness()
    yes.focus()
    container.focus()
    await flush()
    expect(requests[1]).toMatchObject({ is_held: true, element: null })
  })

  it('takes the first autoFocus control and says an auto take moved it', async () => {
    const { sync, requests, yes } = harness()
    expect(sync.takeAutoFocus()).toBe(true)
    await flush()
    expect(document.activeElement).toBe(yes)
    expect(requests).toEqual([
      {
        component: 'Pane',
        instance_id: 'ask',
        is_held: true,
        element: { plugin: 'ask', key: 'yes' },
        by: 'auto'
      }
    ])
  })

  it('focuses the control a push names, without telling the engine back', async () => {
    const { sync, requests, note, no } = harness()
    no.focus()
    await flush()
    requests.length = 0
    sync.applyPush({ plugin: 'ask', key: 'note' })
    await flush()
    expect(document.activeElement).toBe(note)
    expect(requests).toEqual([])
  })

  it('tries a pushed control again after the next drawing when it is not drawn yet', () => {
    const { sync, container, yes } = harness()
    yes.focus()
    sync.applyPush({ plugin: 'ask', key: 'later' })
    const later = control('button', 'later', 'ask')
    container.append(later)
    sync.afterLayout()
    expect(document.activeElement).toBe(later)
  })

  it('tries a control that is not drawn only once, on the next drawing', () => {
    const { sync, container, yes } = harness()
    yes.focus()
    sync.applyPush({ plugin: 'ask', key: 'later' })
    sync.afterLayout()
    container.append(control('button', 'later', 'ask'))
    sync.afterLayout()
    expect(document.activeElement).toBe(yes)
  })

  it('drops a waiting push once the person moves the ring or the keyboard leaves', () => {
    const first = harness()
    first.yes.focus()
    first.sync.applyPush({ plugin: 'ask', key: 'later' })
    first.no.focus()
    first.container.append(control('button', 'later', 'ask'))
    first.sync.afterLayout()
    expect(document.activeElement).toBe(first.no)
    document.body.innerHTML = ''
    const second = harness()
    second.yes.focus()
    second.sync.applyPush({ plugin: 'ask', key: 'later' })
    second.outside.focus()
    second.container.append(control('button', 'later', 'ask'))
    second.sync.afterLayout()
    expect(document.activeElement).toBe(second.outside)
  })

  it('ignores a push while the site does not hold the keyboard', () => {
    const { sync, outside } = harness()
    outside.focus()
    sync.applyPush({ plugin: 'ask', key: 'note' })
    sync.afterLayout()
    expect(document.activeElement).toBe(outside)
  })

  it('does not take a control of another plugin for the key', () => {
    const { sync } = harness()
    expect(sync.findControl({ plugin: 'other', key: 'yes' })).toBeNull()
  })

  it('focuses the element the engine answers with when it redirects the ring', async () => {
    const { requests, no, note } = harness((fields) =>
      JSON.stringify(fields.element) === JSON.stringify({ plugin: 'ask', key: 'no' })
        ? { moved: true, element: { plugin: 'ask', key: 'note' } }
        : null
    )
    no.focus()
    await flush()
    expect(requests).toHaveLength(1)
    expect(document.activeElement).toBe(note)
  })

  it('tells a move within the site, popups included, from one arriving from outside', () => {
    const { container, yes, outside } = harness()
    const popup = document.createElement('div')
    popup.setAttribute('role', 'listbox')
    document.body.append(popup)
    expect(isClaudeModsFocusWithinSite(container, yes)).toBe(true)
    expect(isClaudeModsFocusWithinSite(container, popup)).toBe(true)
    expect(isClaudeModsFocusWithinSite(container, outside)).toBe(false)
    expect(isClaudeModsFocusWithinSite(container, null)).toBe(false)
  })
})
