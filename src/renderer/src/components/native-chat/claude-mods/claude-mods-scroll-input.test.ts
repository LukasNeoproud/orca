// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachClaudeModsScrollInput, PERSON_INPUT_WINDOW_MS } from './claude-mods-scroll-input'

function setup() {
  const element = document.createElement('div')
  const button = document.createElement('button')
  const field = document.createElement('input')
  element.append(button, field)
  document.body.append(element)
  const input = attachClaudeModsScrollInput(element)
  return { element, button, field, input }
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('attachClaudeModsScrollInput', () => {
  it('counts a wheel mark, a scroll key and a touch as the person for a short while', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { element, button, input } = setup()
    expect(input.isPerson()).toBe(false)
    key(button, 'PageDown')
    expect(input.isPerson()).toBe(true)
    now.mockReturnValue(1000 + PERSON_INPUT_WINDOW_MS + 1)
    expect(input.isPerson()).toBe(false)
    element.dispatchEvent(new Event('touchstart'))
    expect(input.isPerson()).toBe(true)
    now.mockReturnValue(5000)
    input.mark()
    expect(input.isPerson()).toBe(true)
  })

  it('does not count keys that press, type or open a Select', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { element, button, field, input } = setup()
    key(button, 'Enter')
    key(button, ' ')
    key(field, 'ArrowDown')
    const trigger = document.createElement('button')
    trigger.setAttribute('role', 'combobox')
    element.append(trigger)
    key(trigger, 'ArrowDown')
    expect(input.isPerson()).toBe(false)
    key(element, ' ')
    expect(input.isPerson()).toBe(true)
  })

  it('counts a press held anywhere inside, but a click on a drawn control is not input after release', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { button, input } = setup()
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    now.mockReturnValue(1000 + 10 * PERSON_INPUT_WINDOW_MS)
    // A drag-select or autoscroll started on a drawn control scrolls while held.
    expect(input.isPerson()).toBe(true)
    window.dispatchEvent(new Event('pointerup'))
    expect(input.isPerson()).toBe(false)
    now.mockReturnValue(1000 + 20 * PERSON_INPUT_WINDOW_MS)
    expect(input.isPerson()).toBe(false)
  })

  it('keeps a scrollbar press the person’s for a while after release', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { element, input } = setup()
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    now.mockReturnValue(1000 + 10 * PERSON_INPUT_WINDOW_MS)
    expect(input.isPerson()).toBe(true)
    window.dispatchEvent(new Event('pointerup'))
    expect(input.isPerson()).toBe(true)
    now.mockReturnValue(1000 + 20 * PERSON_INPUT_WINDOW_MS)
    expect(input.isPerson()).toBe(false)
  })

  it('ends a held press on pointercancel', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { button, input } = setup()
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    window.dispatchEvent(new Event('pointercancel'))
    expect(input.isPerson()).toBe(false)
  })

  it('does not count a click elsewhere in the app', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { input } = setup()
    window.dispatchEvent(new Event('pointerup'))
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(input.isPerson()).toBe(false)
  })

  it('stops listening once detached', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { element, input } = setup()
    input.detach()
    element.dispatchEvent(new Event('touchstart'))
    expect(input.isPerson()).toBe(false)
  })
})
