// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeModsPaneRoster } from '../../../../../shared/claude-mods-surface'
import {
  claudeModsFocusedPane,
  claudeModsFocusRequestAllowed,
  useClaudeModsPaneFocusRequest
} from './claude-mods-pane-focus-request'

function chat(): { root: HTMLElement; composer: HTMLTextAreaElement; button: HTMLButtonElement } {
  document.body.innerHTML = `
    <div id="chat">
      <aside data-claude-mods-pane="guide"><button data-claude-mods-owner="guide">Go</button></aside>
      <textarea id="composer"></textarea>
    </div>
    <textarea id="terminal"></textarea>`
  const root = document.getElementById('chat')!
  return {
    root,
    composer: root.querySelector('textarea')!,
    button: root.querySelector('button')!
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('claudeModsFocusRequestAllowed', () => {
  it('passes a press inside a mods pane, an empty composer and a blank page', () => {
    const { root, composer, button } = chat()
    expect(claudeModsFocusRequestAllowed({ active: button, chatRoot: root, plugin: 'blast' })).toBe(
      true
    )
    expect(
      claudeModsFocusRequestAllowed({ active: composer, chatRoot: root, plugin: 'blast' })
    ).toBe(true)
    expect(
      claudeModsFocusRequestAllowed({ active: document.body, chatRoot: root, plugin: 'blast' })
    ).toBe(true)
  })

  it('refuses while the person types in the composer or works outside the chat', () => {
    const { root, composer } = chat()
    composer.value = 'half a prompt'
    expect(
      claudeModsFocusRequestAllowed({ active: composer, chatRoot: root, plugin: 'blast' })
    ).toBe(false)
    const terminal = document.getElementById('terminal')
    expect(
      claudeModsFocusRequestAllowed({ active: terminal, chatRoot: root, plugin: 'blast' })
    ).toBe(false)
  })

  it('lets a plugin take the keyboard from its own field but not from another one', () => {
    const { root } = chat()
    const field = document.createElement('input')
    field.setAttribute('data-claude-mods-owner', 'guide')
    field.value = 'typed'
    root.append(field)
    expect(claudeModsFocusRequestAllowed({ active: field, chatRoot: root, plugin: 'guide' })).toBe(
      true
    )
    expect(claudeModsFocusRequestAllowed({ active: field, chatRoot: root, plugin: 'blast' })).toBe(
      false
    )
  })

  it('refuses while a dialog is open', () => {
    const { root, button } = chat()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-state', 'open')
    document.body.append(dialog)
    expect(claudeModsFocusRequestAllowed({ active: button, chatRoot: root, plugin: 'blast' })).toBe(
      false
    )
  })
})

describe('claudeModsFocusedPane', () => {
  it('names the pane holding focus, else the composer', () => {
    const { composer, button } = chat()
    expect(claudeModsFocusedPane(button)).toBe('guide')
    expect(claudeModsFocusedPane(composer)).toBeNull()
  })
})

const GUIDE = { id: 'guide', title: 'Guide', plugin: 'guide' }
const BLAST = { id: 'blast', title: 'Blast radius', plugin: 'blast' }

function roster(focusRequested: string | null): ClaudeModsPaneRoster {
  return {
    panes: [GUIDE, BLAST],
    shown_id: 'guide',
    focused_id: 'guide',
    focus_requested_id: focusRequested
  }
}

describe('useClaudeModsPaneFocusRequest', () => {
  it('shows a pane that asked for the keyboard while another pane holds it', () => {
    const { root, button } = chat()
    button.focus()
    const controller = { showPane: vi.fn(), focusPane: vi.fn() }
    const initialProps: { requested: string | null } = { requested: 'blast' }
    const { result, rerender } = renderHook(
      ({ requested }) =>
        useClaudeModsPaneFocusRequest(controller, roster(requested), 'guide', () => root),
      { initialProps }
    )
    expect(controller.showPane).toHaveBeenCalledWith('blast')
    expect(result.current).toBeNull()
    // The same standing request is judged once, whatever re-renders meanwhile.
    rerender({ requested: 'blast' })
    expect(controller.showPane).toHaveBeenCalledOnce()
  })

  it('refuses with the real holder and marks the waiting pane until it is shown', () => {
    const { root, composer } = chat()
    composer.value = 'typing'
    composer.focus()
    const controller = { showPane: vi.fn(), focusPane: vi.fn() }
    const { result, rerender } = renderHook(
      ({ shown }) => useClaudeModsPaneFocusRequest(controller, roster('blast'), shown, () => root),
      { initialProps: { shown: 'guide' } }
    )
    expect(controller.showPane).not.toHaveBeenCalled()
    expect(controller.focusPane).toHaveBeenCalledWith(null, true)
    expect(result.current).toBe('blast')
    rerender({ shown: 'blast' })
    rerender({ shown: 'guide' })
    expect(result.current).toBeNull()
  })
})
