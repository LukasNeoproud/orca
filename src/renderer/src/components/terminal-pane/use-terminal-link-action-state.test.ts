// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalLinkActionRequest } from './terminal-link-action-request'
import { useTerminalLinkActionState } from './use-terminal-link-action-state'

function previewRequest(
  overrides: Partial<TerminalLinkActionRequest> = {}
): TerminalLinkActionRequest {
  return {
    anchorX: 20,
    anchorY: 30,
    destination: 'https://example.com/docs',
    kind: 'url',
    paneId: 4,
    preview: {
      target: {
        href: 'https://example.com/docs',
        key: 'https://example.com/docs',
        path: 'https://example.com/docs',
        line: null,
        kind: 'web'
      }
    },
    primary: { label: 'Open', run: vi.fn() },
    restoreFocus: vi.fn(),
    transient: true,
    ...overrides
  }
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('terminal link preview timing', () => {
  it('opens after 250ms and closes 150ms after leaving the link and card', () => {
    const hook = renderHook(useTerminalLinkActionState)
    act(() => hook.result.current.requestPreview(previewRequest()))
    act(() => vi.advanceTimersByTime(249))
    expect(hook.result.current.request).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(hook.result.current.request?.transient).toBe(true)

    act(() => hook.result.current.leavePreview(4))
    act(() => vi.advanceTimersByTime(100))
    act(() => hook.result.current.onPointerEnter())
    act(() => vi.advanceTimersByTime(100))
    expect(hook.result.current.request).not.toBeNull()

    act(() => hook.result.current.onPointerLeave())
    act(() => vi.advanceTimersByTime(150))
    expect(hook.result.current.request).toBeNull()
  })

  it('pins the hovered request on click without moving its anchor', () => {
    const hook = renderHook(useTerminalLinkActionState)
    act(() => hook.result.current.requestPreview(previewRequest()))
    act(() => vi.advanceTimersByTime(250))

    act(() =>
      hook.result.current.requestAction(
        previewRequest({
          anchorX: 90,
          anchorY: 100,
          primary: { label: 'Open pinned', run: vi.fn() }
        })
      )
    )

    expect(hook.result.current.request).toEqual(
      expect.objectContaining({ anchorX: 20, anchorY: 30, transient: false })
    )
    expect(hook.result.current.request?.primary.label).toBe('Open pinned')
    act(() => hook.result.current.leavePreview(4))
    act(() => vi.advanceTimersByTime(150))
    expect(hook.result.current.request).not.toBeNull()
  })

  it('keeps pinned previews across output but dismisses them on pane teardown', () => {
    const hook = renderHook(useTerminalLinkActionState)
    act(() => hook.result.current.requestAction(previewRequest({ transient: false })))
    act(() => hook.result.current.invalidatePanePreview(4))
    expect(hook.result.current.request).not.toBeNull()
    act(() => hook.result.current.dismissPanePreview(4))
    expect(hook.result.current.request).toBeNull()
  })

  it('does not replace a pinned preview when another link is hovered', () => {
    const hook = renderHook(useTerminalLinkActionState)
    act(() => hook.result.current.requestAction(previewRequest({ transient: false })))
    act(() =>
      hook.result.current.requestPreview(
        previewRequest({
          destination: 'https://other.example',
          preview: {
            target: {
              href: 'https://other.example',
              key: 'https://other.example',
              path: 'https://other.example',
              line: null,
              kind: 'web'
            }
          }
        })
      )
    )
    act(() => vi.advanceTimersByTime(250))
    expect(hook.result.current.request?.destination).toBe('https://example.com/docs')
  })

  it('does not disturb preview timers when another pane produces output', () => {
    const hook = renderHook(useTerminalLinkActionState)
    act(() => hook.result.current.requestPreview(previewRequest()))
    act(() => vi.advanceTimersByTime(250))
    act(() => hook.result.current.leavePreview(4))
    act(() => hook.result.current.invalidatePanePreview(9))
    act(() => vi.advanceTimersByTime(150))
    expect(hook.result.current.request).toBeNull()
  })
})
