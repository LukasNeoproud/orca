import { useRef } from 'react'
import {
  claudeModsClientButton,
  claudeModsClientPointer,
  type ClaudeModsClientCell,
  type ClaudeModsClientPointerEvent
} from './claude-mods-client-events'

type Button = 'left' | 'middle' | 'right'
type PointerLike = Parameters<typeof claudeModsClientPointer>[1]

const BUTTON_INDEX: Readonly<Record<Button, number>> = { left: 0, middle: 1, right: 2 }

/** A down on one of the drawing's own controls: capturing it would steal the control's click. */
function onControl(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    target.closest('button, input, select, textarea, a, [role="combobox"]') !== null
  )
}

/**
 * The region's pointer as the module hears it, in cells: after a `down` the module holds the
 * pointer until the `up`, past the edges too; `enter`/`leave` carry the last cell a move named.
 */
export function useClaudeModsClientPointer({
  regionRef,
  cellRef,
  enabled,
  send
}: {
  regionRef: React.RefObject<HTMLDivElement | null>
  cellRef: React.RefObject<ClaudeModsClientCell>
  enabled: boolean
  send: (event: ClaudeModsClientPointerEvent) => boolean
}): {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void
  onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
} {
  const held = useRef<Button | undefined>(undefined)
  const last = useRef({ x: 0, y: 0 })
  const emit = (type: 'down' | 'move' | 'up', event: PointerLike): void => {
    const origin = regionRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const built = claudeModsClientPointer(type, event, origin, cellRef.current, held.current)
    last.current = { x: built.x, y: built.y }
    send(built)
  }
  // Whatever ends a press clears it, heard or not: a stuck button would ride every later move.
  const end = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (held.current === undefined) {
      return
    }
    if (enabled) {
      // A cancel or a lost capture names no button: the up releases the one held.
      const { clientX, clientY, shiftKey, altKey, ctrlKey } = event
      const button = event.button >= 0 ? event.button : BUTTON_INDEX[held.current]
      emit('up', { clientX, clientY, button, shiftKey, altKey, ctrlKey })
    }
    held.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  return {
    onPointerDown: (event) => {
      if (!enabled) {
        return
      }
      held.current = claudeModsClientButton(event.button)
      if (!onControl(event.target)) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      emit('down', event)
    },
    onPointerMove: (event) => {
      if (enabled) {
        emit('move', event)
      }
    },
    onPointerUp: end,
    // The browser took the press away (a touch scroll, a pen lifted out of range): it ends here.
    onPointerCancel: end,
    onLostPointerCapture: end,
    onPointerEnter: () => {
      if (enabled && held.current === undefined) {
        send({ type: 'enter', ...last.current })
      }
    },
    onPointerLeave: () => {
      // A held pointer stays the module's until the up, wherever it goes.
      if (enabled && held.current === undefined) {
        send({ type: 'leave', ...last.current })
      }
    }
  }
}
