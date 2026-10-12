import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport-types'
import {
  terminalCommentSelectionRect,
  type TerminalCommentRect
} from './terminal-comment-selection'

export type TerminalCommentSelection = {
  quote: string
  rect: TerminalCommentRect
  transport: PtyTransport
  ptyId: string
}

export function useTerminalCommentSelection(
  pane: ManagedPane,
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
) {
  const [selection, setSelection] = useState<TerminalCommentSelection | null>(null)
  const editingRef = useRef(false)
  const suppressedQuote = useRef<string | null>(null)
  const { terminal, container, id } = pane

  useEffect(() => {
    let frame: number | null = null
    let dragging = false
    const update = () => {
      frame = null
      if (editingRef.current || dragging) {
        return
      }
      const quote = terminal.getSelection()
      const range = terminal.getSelectionPosition()
      const screen = terminal.element?.querySelector('.xterm-screen')
      const transport = paneTransportsRef.current.get(id)
      const ptyId = transport?.getPtyId()
      if (!quote.trim() || !range || !screen || !transport?.isConnected() || !ptyId) {
        suppressedQuote.current = null
        setSelection(null)
        return
      }
      if (quote === suppressedQuote.current) {
        return
      }
      const rect = terminalCommentSelectionRect({
        range,
        screen: screen.getBoundingClientRect(),
        cols: terminal.cols,
        rows: terminal.rows,
        viewportY: terminal.buffer.active.viewportY
      })
      setSelection(rect ? { quote, rect, transport, ptyId } : null)
    }
    const schedule = () => {
      if (frame === null) {
        frame = requestAnimationFrame(update)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0 && terminal.element?.contains(event.target as Node)) {
        dragging = true
        suppressedQuote.current = null
        if (!editingRef.current) {
          setSelection(null)
        }
      }
    }
    const onPointerUp = () => {
      if (dragging) {
        dragging = false
        schedule()
      }
    }
    const listeners = [
      terminal.onSelectionChange(schedule),
      terminal.onScroll(schedule),
      terminal.onResize(schedule)
    ]
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    container.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      listeners.forEach((listener) => listener.dispose())
      observer.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [terminal, container, id, paneTransportsRef])

  const onEditingChange = useCallback((editing: boolean) => {
    editingRef.current = editing
  }, [])
  const dismiss = useCallback(() => {
    suppressedQuote.current = terminal.getSelection()
    editingRef.current = false
    setSelection(null)
  }, [terminal])

  return { selection, onEditingChange, dismiss }
}
