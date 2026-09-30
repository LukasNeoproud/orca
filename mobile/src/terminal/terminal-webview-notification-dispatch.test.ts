import { describe, expect, it, vi } from 'vitest'

import { dispatchTerminalWebViewNotification } from './terminal-webview-notification-dispatch'

describe('dispatchTerminalWebViewNotification', () => {
  it('preserves bounded keyboard metrics through the dispatcher', () => {
    const onKeyboardAvoidanceMetrics = vi.fn()
    dispatchTerminalWebViewNotification(
      {
        type: 'keyboard-avoidance-metrics',
        cursorY: 30,
        contentBottomRow: 99,
        rows: 40,
        altScreen: true
      },
      { onKeyboardAvoidanceMetrics, reportEngineError: vi.fn() }
    )
    expect(onKeyboardAvoidanceMetrics).toHaveBeenCalledWith({
      cursorY: 30,
      contentBottomRow: 39,
      rows: 40,
      altScreen: true
    })
  })

  it('keeps old WebView payloads cursor-compatible', () => {
    const onKeyboardAvoidanceMetrics = vi.fn()
    dispatchTerminalWebViewNotification(
      { type: 'keyboard-avoidance-metrics', cursorY: 12, rows: 40 },
      { onKeyboardAvoidanceMetrics, reportEngineError: vi.fn() }
    )
    expect(onKeyboardAvoidanceMetrics).toHaveBeenCalledWith({
      cursorY: 12,
      contentBottomRow: 12,
      rows: 40,
      altScreen: false
    })
  })

  it('routes file and web link action requests', () => {
    const onLinkActions = vi.fn()
    const handlers = { onLinkActions, reportEngineError: vi.fn() }

    dispatchTerminalWebViewNotification(
      { type: 'link-actions', kind: 'file', pathText: 'src/app.ts', line: 12, column: 3 },
      handlers
    )
    dispatchTerminalWebViewNotification(
      { type: 'link-actions', kind: 'web', url: 'https://example.com' },
      handlers
    )

    expect(onLinkActions).toHaveBeenNthCalledWith(1, {
      kind: 'file',
      pathText: 'src/app.ts',
      line: 12,
      column: 3
    })
    expect(onLinkActions).toHaveBeenNthCalledWith(2, {
      kind: 'web',
      url: 'https://example.com'
    })
  })

  it('routes selected response text to the comment handler verbatim', () => {
    const onSelectionComment = vi.fn()
    dispatchTerminalWebViewNotification(
      { type: 'selection-comment', text: '  exact\nquote  ' },
      { onSelectionComment, reportEngineError: vi.fn() }
    )

    expect(onSelectionComment).toHaveBeenCalledWith('  exact\nquote  ')
  })
})
