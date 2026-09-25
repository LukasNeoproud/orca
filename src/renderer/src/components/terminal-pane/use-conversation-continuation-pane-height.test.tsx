// @vitest-environment happy-dom

import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import { useConversationContinuationPaneHeight } from './use-conversation-continuation-pane-height'

const originalResizeObserver = globalThis.ResizeObserver

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
})

it('reserves the measured toolbar height, refits, and clears the reservation on unmount', () => {
  let notifyResize: (() => void) | undefined
  const disconnect = vi.fn()
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this)
    }
    observe() {}
    unobserve() {}
    disconnect = disconnect
  } as unknown as typeof ResizeObserver
  let height = 44
  const toolbarBounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ height }) as DOMRect)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const pane = { id: 1, container } as unknown as ManagedPane
  const fitAllPanes = vi.fn()
  const managerRef = { current: { fitAllPanes } as unknown as PaneManager }
  const onHeightChange = vi.fn()
  const root = createRoot(container)

  function Harness() {
    const toolbarRef = useRef<HTMLDivElement>(null)
    useConversationContinuationPaneHeight(
      toolbarRef,
      pane,
      managerRef,
      true,
      'session-1',
      onHeightChange
    )
    return <div ref={toolbarRef}>Toolbar</div>
  }

  act(() => root.render(<Harness />))
  expect(container.style.getPropertyValue('--orca-pane-continuation-height')).toBe('44px')
  expect(onHeightChange).toHaveBeenCalledWith(1, 44)
  height = 88
  act(() => notifyResize?.())
  expect(container.style.getPropertyValue('--orca-pane-continuation-height')).toBe('88px')
  expect(onHeightChange).toHaveBeenCalledWith(1, 88)
  expect(fitAllPanes).toHaveBeenCalledTimes(2)

  act(() => root.unmount())
  expect(container.style.getPropertyValue('--orca-pane-continuation-height')).toBe('')
  expect(onHeightChange).toHaveBeenLastCalledWith(1, 0)
  expect(disconnect).toHaveBeenCalledOnce()
  toolbarBounds.mockRestore()
  container.remove()
})
