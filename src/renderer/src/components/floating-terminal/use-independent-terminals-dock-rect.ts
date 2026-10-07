import { useLayoutEffect, useState } from 'react'
import { INDEPENDENT_TERMINALS_DOCK_ATTRIBUTE } from '@/lib/independent-terminals-view'
import type { FloatingTerminalPanelBounds } from './floating-terminal-panel-bounds'

function findDockAnchor(): Element | null {
  return typeof document !== 'undefined' && typeof document.querySelector === 'function'
    ? document.querySelector(`[${INDEPENDENT_TERMINALS_DOCK_ATTRIBUTE}]`)
    : null
}

function readDockRect(): FloatingTerminalPanelBounds | null {
  const anchor = findDockAnchor()
  if (!anchor) {
    return null
  }
  const rect = anchor.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function sameRect(a: FloatingTerminalPanelBounds | null, b: FloatingTerminalPanelBounds | null) {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.height === b.height)
  )
}

/**
 * Tracks the workbench area the panel docks over.
 *
 * Why an overlay over a measured anchor instead of rendering in place: moving the panel
 * into the workbench subtree would remount its xterm instances and drop live sessions.
 */
export function useIndependentTerminalsDockRect(open: boolean): FloatingTerminalPanelBounds | null {
  const [rect, setRect] = useState<FloatingTerminalPanelBounds | null>(readDockRect)

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const update = (): void => {
      const next = readDockRect()
      setRect((current) => (sameRect(current, next) ? current : next))
    }
    update()
    const anchor = findDockAnchor()
    const observer =
      anchor && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (anchor) {
      observer?.observe(anchor)
    }
    // Why resize too: ResizeObserver reports size only, not position shifts.
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [open])

  return rect
}
