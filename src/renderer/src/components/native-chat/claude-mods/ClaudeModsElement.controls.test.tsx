// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClaudeModsDrawContext,
  type ClaudeModsDispatch,
  type ClaudeModsDrawScope
} from './claude-mods-draw-scope'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { readClaudeModsTree } from './claude-mods-tree'
import { ClaudeModsNodeView } from './ClaudeModsElement'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const dispatch = {
  press: vi.fn(),
  input: vi.fn(async () => {}),
  select: vi.fn()
} satisfies ClaudeModsDispatch

const scope: ClaudeModsDrawScope = {
  controller: new ClaudeModsSurfaceController(
    { request: async () => null, subscribe: async () => ({ unsubscribe: () => {} }) },
    () => {}
  ),
  component: 'Pane',
  instanceId: 'pane',
  focusRequested: false,
  dispatch
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function draw(tree: unknown): void {
  act(() =>
    root.render(
      <ClaudeModsDrawContext.Provider value={scope}>
        <ClaudeModsNodeView node={readClaudeModsTree(tree)} />
      </ClaudeModsDrawContext.Provider>
    )
  )
}

const press = { plugin: 'p', handle: 4 }

describe('Input', () => {
  const input = {
    type: 'Input',
    props: { key: 'name', value: '', submitLabel: 'Add', label: 'Name' },
    press
  }

  it('submits the typed text from the Enter key and from the submit button alike', () => {
    draw(input)
    const field = container.querySelector('input')!
    expect(field.getAttribute('data-slot')).toBe('input')
    expect(field.className).toContain('h-6')
    expect(field.className).not.toMatch(/(^| )w-full/)
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(field, 'milk')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(button.textContent).toBe('Add')
    act(() => button.click())
    expect(dispatch.input).toHaveBeenCalledWith(press, 'name', 'submit', 'milk')
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(dispatch.input).toHaveBeenCalledTimes(2)
  })

  it('draws no submit button without a submitLabel', () => {
    draw({ ...input, props: { key: 'name' } })
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' }
  ]

  it('shows the first option when the mod gave no value', () => {
    draw({ type: 'Select', props: { key: 's', options }, press })
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain('Alpha')
    expect(container.querySelector('[role="combobox"]')?.getAttribute('data-size')).toBe('xs')
  })

  it('shows the drawn value, and takes the next drawn value over a pick', () => {
    draw({ type: 'Select', props: { key: 's', options, value: 'b' }, press })
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain('Beta')
    draw({ type: 'Select', props: { key: 's', options, value: 'a' }, press })
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain('Alpha')
  })
})

describe('Button', () => {
  it('stays enabled without a press, and keeps its children', () => {
    draw({
      type: 'Button',
      props: { label: 'Shown as aria' },
      children: [{ type: 'Text', children: ['kept'] }]
    })
    const button = container.querySelector('button')!
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('kept')
    expect(button.getAttribute('aria-label')).toBe('Shown as aria')
    act(() => button.click())
    expect(dispatch.press).not.toHaveBeenCalled()
  })

  it('puts the hotkey chip after the label, and before it on a plain button', () => {
    draw({ type: 'Button', props: { label: 'Go', hotkey: 'g' }, press })
    expect(container.querySelector('button')?.textContent).toMatch(/^Go\s*G$/i)
    draw({ type: 'Button', props: { label: 'Go', hotkey: 'g', plain: true }, press })
    expect(container.querySelector('button')?.textContent).toMatch(/^G\s*Go$/i)
  })
})

describe('Box, Link and Svg', () => {
  it('centres text beside a button in a row with no alignItems', () => {
    draw({ type: 'Box', children: ['x'] })
    expect(container.firstElementChild?.className).toContain('[&>span]:self-center')
    draw({ type: 'Box', props: { alignItems: 'flex-start' }, children: ['x'] })
    expect(container.firstElementChild?.className).not.toContain('self-center')
    draw({ type: 'Box', props: { flexDirection: 'column' }, children: ['x'] })
    expect(container.firstElementChild?.className).not.toContain('self-center')
  })

  it('draws a Link in the chat link look', () => {
    draw({ type: 'Link', props: { href: 'https://example.com', label: 'Docs' } })
    expect(container.querySelector('a')?.className).toContain('text-chat-foreground-strong')
  })

  it('inks an Svg with the host color and font, and sizes it', () => {
    draw({
      type: 'Svg',
      props: {
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2z"/></svg>',
        width: 9000,
        height: 40,
        isInteractive: true
      }
    })
    const image = container.querySelector('img')!
    const decoded = decodeURIComponent(image.getAttribute('src')!.split(',').slice(1).join(','))
    expect(decoded).toContain('color="')
    expect(decoded).toContain('font-family="')
    expect(image.style.width).toBe('4096px')
    expect(image.style.height).toBe('40px')
  })
})
