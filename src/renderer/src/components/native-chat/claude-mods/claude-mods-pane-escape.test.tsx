// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isClaudeModsEscapeRepeat } from './claude-mods-escape-latch'
import { handleClaudeModsSiteEscape } from './claude-mods-pane-escape'

function pane(close: () => void, focusComposer: () => void): void {
  render(
    <aside
      data-testid="pane"
      onKeyDown={(event) => {
        handleClaudeModsSiteEscape(event, focusComposer, close)
      }}
    >
      <input aria-label="note" defaultValue="half typed" />
      <button type="button">Go</button>
      <div role="listbox">
        <div role="option" tabIndex={0}>
          One
        </div>
      </div>
    </aside>
  )
}

afterEach(() => {
  cleanup()
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
})

describe('handleClaudeModsSiteEscape', () => {
  it('gives the keyboard back from a field without closing the pane', () => {
    const close = vi.fn()
    const focusComposer = vi.fn()
    pane(close, focusComposer)
    const field = screen.getByLabelText('note')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    expect(focusComposer).toHaveBeenCalledOnce()
    expect(document.activeElement).not.toBe(field)
  })

  it('leaves the pane on an Escape the pane owns, and holds its auto-repeat', () => {
    const close = vi.fn()
    const focusComposer = vi.fn()
    pane(close, focusComposer)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Go' }), { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    expect(focusComposer).toHaveBeenCalledOnce()
    expect(isClaudeModsEscapeRepeat({ key: 'Escape', repeat: true })).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
    expect(isClaudeModsEscapeRepeat({ key: 'Escape', repeat: true })).toBe(false)
  })

  it('leaves an Escape alone when an open list, a repeat or a handled event owns it', () => {
    const close = vi.fn()
    const focusComposer = vi.fn()
    pane(close, focusComposer)
    fireEvent.keyDown(screen.getByRole('option'), { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Go' }), { key: 'Escape', repeat: true })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    screen.getByRole('button', { name: 'Go' }).dispatchEvent(handled)
    expect(close).not.toHaveBeenCalled()
    expect(focusComposer).not.toHaveBeenCalled()
  })
})
