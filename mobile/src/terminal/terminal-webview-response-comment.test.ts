// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { useTerminalMouseWebViewHarness } from './terminal-webview-mouse-test-harness'

describe('terminal response comment action', () => {
  const harness = useTerminalMouseWebViewHarness()

  it('sends the exact selected quote to native UI without sending terminal input', () => {
    harness.boot()
    const quote = '  const answer = 42\n\nNext line'
    vi.spyOn(harness.activeTerminal(), 'getSelection').mockReturnValue(quote)
    harness.clearPostedMessages()
    document.getElementById('sel-menu-comment')!.click()
    expect(harness.postedMessages()).toContainEqual({ type: 'selection-comment', text: quote })
    expect(harness.terminalInputBytes()).toBe('')
  })

  it('does not open the editor when the selection is empty', () => {
    harness.boot()
    harness.clearPostedMessages()
    document.getElementById('sel-menu-comment')!.click()
    expect(harness.postedMessages().some((message) => message.type === 'selection-comment')).toBe(
      false
    )
    expect(harness.terminalInputBytes()).toBe('')
  })
})
