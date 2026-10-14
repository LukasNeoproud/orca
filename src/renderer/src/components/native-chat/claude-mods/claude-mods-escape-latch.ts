// Escape that left a mods site for the composer: its auto-repeat must not reach the composer,
// where Escape interrupts the agent. Held until that Escape is released, like Claude Desktop.

let latched = false

function release(): void {
  latched = false
  window.removeEventListener('keyup', onKeyUp, true)
  window.removeEventListener('blur', release)
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    release()
  }
}

/** A mods site just spent an Escape moving the keyboard to the composer. */
export function latchClaudeModsEscapeRepeat(): void {
  if (latched) {
    return
  }
  latched = true
  window.addEventListener('keyup', onKeyUp, true)
  // A key-up while the window is away never arrives.
  window.addEventListener('blur', release)
}

/** Whether this Escape is the held key's auto-repeat, which nothing may act on. */
export function isClaudeModsEscapeRepeat(event: Pick<KeyboardEvent, 'key' | 'repeat'>): boolean {
  if (!latched || event.key !== 'Escape') {
    return false
  }
  if (!event.repeat) {
    // A fresh press: the release went unseen.
    release()
    return false
  }
  return true
}
