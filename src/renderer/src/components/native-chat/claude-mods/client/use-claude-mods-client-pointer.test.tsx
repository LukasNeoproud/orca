// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claudeModsClientCell,
  type ClaudeModsClientPointerEvent
} from './claude-mods-client-events'
import { useClaudeModsClientPointer } from './use-claude-mods-client-pointer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Probe({
  enabled,
  sent
}: {
  enabled: boolean
  sent: ClaudeModsClientPointerEvent[]
}): React.JSX.Element {
  const regionRef = useRef<HTMLDivElement>(null)
  const cellRef = useRef(claudeModsClientCell(10))
  const pointer = useClaudeModsClientPointer({
    regionRef,
    cellRef,
    enabled,
    send: (event) => {
      sent.push(event)
      return true
    }
  })
  return (
    <div
      ref={regionRef}
      data-probe=""
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerCancel}
      onLostPointerCapture={pointer.onLostPointerCapture}
      onPointerEnter={pointer.onPointerEnter}
      onPointerLeave={pointer.onPointerLeave}
    />
  )
}

function region(): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-probe]')
  if (!element) {
    throw new Error('no probe')
  }
  // happy-dom has no pointer capture.
  element.setPointerCapture = () => {}
  element.hasPointerCapture = () => false
  element.releasePointerCapture = () => {}
  return element
}

function fire(type: string, init: PointerEventInit = {}): void {
  act(() => {
    region().dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 12, clientY: 30, ...init })
    )
  })
}

function render(enabled: boolean, sent: ClaudeModsClientPointerEvent[]): void {
  act(() => root.render(<Probe enabled={enabled} sent={sent} />))
}

describe('useClaudeModsClientPointer', () => {
  it('forgets the held button on an up it does not send', () => {
    const sent: ClaudeModsClientPointerEvent[] = []
    render(true, sent)
    fire('pointerdown', { button: 0 })
    render(false, sent)
    fire('pointerup', { button: 0 })
    render(true, sent)
    fire('pointermove', { button: -1 })
    expect(sent.map((event) => event.type)).toEqual(['down', 'move'])
    expect(sent.at(-1)?.button).toBeUndefined()
  })

  it('ends a press the browser cancels with an up of the held button', () => {
    const sent: ClaudeModsClientPointerEvent[] = []
    render(true, sent)
    fire('pointerdown', { button: 2 })
    fire('pointercancel', { button: -1 })
    fire('lostpointercapture', { button: -1 })
    fire('pointermove', { button: -1 })
    expect(sent.map((event) => [event.type, event.button])).toEqual([
      ['down', 'right'],
      ['up', 'right'],
      ['move', undefined]
    ])
  })
})
