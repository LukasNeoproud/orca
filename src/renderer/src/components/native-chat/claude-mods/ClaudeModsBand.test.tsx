// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import { TooltipProvider } from '../../ui/tooltip'
import { ClaudeModsAbovePromptBand } from './ClaudeModsBand'
import { publishClaudeModsController } from './claude-mods-pane-surfaces'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const ROSTER = { panes: [], shown_id: null, focused_id: null, focus_requested_id: null }
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const KEY = 'pane-band'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  publishClaudeModsController(KEY, null)
  container.remove()
})

async function mountBand(
  tree: unknown,
  options: { statuses?: Record<string, string>; focusComposer?: () => void } = {}
) {
  const calls: { subtype: ClaudeModsRequestSubtype; fields: Record<string, unknown> }[] = []
  let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype, fields) => {
        calls.push({ subtype, fields })
        return subtype === 'ui_render' && tree !== null
          ? { tree, hooked: true, drawn_by: ['p'] }
          : { tree: { type: 'engine', ref: 0 }, hooked: false, drawn_by: [] }
      },
      subscribe: async (handlers) => {
        emit = handlers.onEvent
        return { unsubscribe: () => {} }
      }
    },
    () => {}
  )
  controller.start()
  await flush()
  emit({ type: 'state', available: true, roster: ROSTER, statuses: options.statuses ?? {} })
  emit({ type: 'log', plugin: 'p', text: 'debug chatter' })
  publishClaudeModsController(KEY, controller)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ClaudeModsAbovePromptBand paneKey={KEY} focusComposer={options.focusComposer} />
      </TooltipProvider>
    )
    await flush()
  })
  return { calls, controller }
}

const dismissButton = {
  type: 'Button',
  props: { key: 'x', label: 'Dismiss tip', role: 'dismiss' },
  press: { plugin: 'p', handle: 7 }
}

describe('ClaudeModsAbovePromptBand', () => {
  it('draws the mod on a dock attached to the composer and never draws the log lines', async () => {
    await mountBand({ type: 'Box', children: [{ type: 'Text', children: ['A tip'] }] })
    const body = container.querySelector('[data-claude-mods-band-body]')
    expect(body?.textContent).toBe('A tip')
    expect(body?.parentElement?.className).toContain('rounded-t-md')
    expect(body?.parentElement?.className).toContain('border-b-0')
    expect(container.textContent).not.toContain('debug chatter')
  })

  it('sends twelve rows as its room', async () => {
    const { calls } = await mountBand({ type: 'Text', children: ['x'] })
    const ask = calls.find((call) => call.subtype === 'ui_render')
    expect(ask?.fields.props).toMatchObject({ maxRows: 12 })
  })

  it('draws nothing when the tree has nothing visible', async () => {
    await mountBand({ type: 'Box', children: [{ type: 'Text', children: [' '] }] })
    expect(container.querySelector('[data-claude-mods-band-body]')).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('lifts a dismiss Button into a labelled icon button that presses it', async () => {
    const { calls } = await mountBand({
      type: 'Box',
      children: [{ type: 'Text', children: ['A tip'] }, dismissButton]
    })
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss tip"]')
    expect(close).not.toBeNull()
    expect(container.querySelector('[data-claude-mods-band-body]')?.textContent).toBe('A tip')
    await act(async () => close?.click())
    await act(async () => flush())
    expect(calls.some((call) => call.subtype === 'ui_press' && call.fields.handle === 7)).toBe(true)
  })

  it('lets a fitting band show hover cards past its edge', async () => {
    await mountBand({ type: 'Text', children: ['A tip'] })
    const body = container.querySelector('[data-claude-mods-band-body]')
    expect(body?.getAttribute('data-fits')).toBe('true')
  })

  it('hands Escape to the composer, from a field too, and ignores a held key', async () => {
    const focusComposer = vi.fn()
    await mountBand(
      {
        type: 'Box',
        children: [
          { type: 'Text', children: ['A tip'] },
          { type: 'Input', props: { key: 'name', value: '' }, press: { plugin: 'p', handle: 2 } }
        ]
      },
      { focusComposer }
    )
    const body = container.querySelector<HTMLElement>('[data-claude-mods-band-body]')
    const input = container.querySelector('input')
    const press = (target: Element | null | undefined, repeat = false) =>
      act(async () => {
        target?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, repeat })
        )
      })
    await press(body, true)
    expect(focusComposer).not.toHaveBeenCalled()
    input?.focus()
    await press(input)
    expect(focusComposer).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(input)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
    await press(body)
    expect(focusComposer).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
  })

  it('keeps status lines when no mod draws the band', async () => {
    await mountBand(null, { statuses: { alpha: 'Ready', beta: 'Busy', gamma: 'Idle' } })
    expect(container.querySelector('[data-claude-mods-band-body]')).toBeNull()
    expect(container.textContent).toContain('alpha')
    expect(container.textContent).toContain('Busy')
    expect(container.textContent).not.toContain('Idle')
    expect(container.textContent).toContain('+1')
  })
})
