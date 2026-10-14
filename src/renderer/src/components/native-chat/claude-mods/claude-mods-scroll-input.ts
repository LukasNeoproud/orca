// Which scrolls of a site are the person's: those a wheel, scroll key, touch or a press held
// inside the element started (a scrollbar drag, a drag-select or middle-click autoscroll).
// A click elsewhere, or a layout change, is not input.

import { isClaudeModsTextField } from './claude-mods-focus-keyboard'

/** Scrolls this soon after a wheel, key or touch are the person's; later ones are layout's. */
export const PERSON_INPUT_WINDOW_MS = 600

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export type ClaudeModsScrollInput = {
  /** A wheel, key or touch just happened, a press inside is held, or a scrollbar press just ended. */
  isPerson: () => boolean
  mark: () => void
  detach: () => void
}

export function attachClaudeModsScrollInput(element: HTMLElement): ClaudeModsScrollInput {
  let lastInput = Number.NEGATIVE_INFINITY
  let pressed = false
  let onScrollbar = false
  const mark = (): void => {
    lastInput = performance.now()
  }
  const release = (): void => {
    pressed = false
    // Only a scrollbar drag keeps scrolling by momentum after release; a click does not.
    if (onScrollbar) {
      mark()
    }
    onScrollbar = false
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (pressed) {
      return
    }
    // Any press held inside can scroll (autoscroll); its redraw comes after release, not during.
    pressed = true
    onScrollbar = event.target === element
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target
    // Space scrolls only when nothing inside takes it; a field or a Select keeps its own keys.
    if (
      SCROLL_KEYS.has(event.key) &&
      !isClaudeModsTextField(target) &&
      !(target instanceof Element && target.closest('[role="combobox"]')) &&
      (event.key !== ' ' || target === element)
    ) {
      mark()
    }
  }
  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('keydown', onKeyDown)
  element.addEventListener('touchstart', mark, { passive: true })
  element.addEventListener('touchmove', mark, { passive: true })
  return {
    isPerson: () => pressed || performance.now() - lastInput < PERSON_INPUT_WINDOW_MS,
    mark,
    detach: () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('keydown', onKeyDown)
      element.removeEventListener('touchstart', mark)
      element.removeEventListener('touchmove', mark)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }
}
