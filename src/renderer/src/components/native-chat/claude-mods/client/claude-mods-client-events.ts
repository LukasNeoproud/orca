// What crosses between the person, a surface module and its plugin, in the shapes Claude Code's
// terminal host uses: key names, pointer cells, a fault's one-line reason, and the bounds a
// `surface.post` must stay inside before it goes to the plugin.

export type ClaudeModsClientKeyEvent = { key: string; ctrl?: true; shift?: true; meta?: true }

export type ClaudeModsClientPointerType = 'down' | 'move' | 'up' | 'enter' | 'leave'

export type ClaudeModsClientPointerEvent = {
  type: ClaudeModsClientPointerType
  x: number
  y: number
  fine?: { x: number; y: number }
  button?: 'left' | 'middle' | 'right'
  shift?: true
  alt?: true
  ctrl?: true
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Home: 'home',
  End: 'end',
  Enter: 'return',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ' ': 'space'
}

type KeyLike = { key: string; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }

/** Keys that hand the focus back to the app; the module never hears them. */
export function releasesClaudeModsClientFocus(event: KeyLike): boolean {
  return (
    event.key === 'Escape' ||
    (event.ctrlKey && !event.metaKey && (event.key === 'c' || event.key === 'd'))
  )
}

/** A DOM key as the module hears it; null for a key the terminal would not deliver. */
export function claudeModsClientKey(event: KeyLike): ClaudeModsClientKeyEvent | null {
  const named = Object.hasOwn(NAMED_KEYS, event.key) ? NAMED_KEYS[event.key] : undefined
  // A typed character is one code point; other named keys (Shift, F1, Insert) never arrive.
  const key = named ?? ([...event.key].length === 1 ? event.key : null)
  if (key === null) {
    return null
  }
  return {
    key,
    ...(event.ctrlKey ? { ctrl: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.metaKey ? { meta: true } : {})
  }
}

export type ClaudeModsClientCell = { width: number; height: number }

/** A cell of the chat's monospace advance and line height, as mods measure their sites. */
export function claudeModsClientCell(fontSizePx: number): ClaudeModsClientCell {
  const fontSize = fontSizePx > 0 ? fontSizePx : 14
  return { width: fontSize * 0.6, height: fontSize * 1.4 }
}

const FINE_DIGITS = 1000

type PointerLike = {
  clientX: number
  clientY: number
  button: number
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
}

const BUTTONS: Readonly<Record<number, 'left' | 'middle' | 'right'>> = {
  0: 'left',
  1: 'middle',
  2: 'right'
}

export function claudeModsClientButton(button: number): 'left' | 'middle' | 'right' | undefined {
  return BUTTONS[button]
}

/** A pointer event in the region's cells; `held` is the button a move carries while down. */
export function claudeModsClientPointer(
  type: 'down' | 'move' | 'up',
  event: PointerLike,
  origin: { left: number; top: number },
  cell: ClaudeModsClientCell,
  held: 'left' | 'middle' | 'right' | undefined
): ClaudeModsClientPointerEvent {
  const fineX = (event.clientX - origin.left) / cell.width
  const fineY = (event.clientY - origin.top) / cell.height
  const button = type === 'move' ? held : claudeModsClientButton(event.button)
  return {
    type,
    x: Math.floor(fineX),
    y: Math.floor(fineY),
    fine: {
      x: Math.round(fineX * FINE_DIGITS) / FINE_DIGITS,
      y: Math.round(fineY * FINE_DIGITS) / FINE_DIGITS
    },
    ...(button ? { button } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
    ...(event.ctrlKey ? { ctrl: true } : {})
  }
}

export const CLAUDE_MODS_CLIENT_REASON_MAX = 200

/** A fault's reason as `ui_client_fault` takes it: one line of at most 200 characters. */
export function scrubClaudeModsClientReason(reason: string): string {
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what goes.
  const line = reason.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim()
  // The CLI counts UTF-16 units; cutting by code point never splits a surrogate pair.
  let out = ''
  for (const char of line) {
    if (out.length + char.length > CLAUDE_MODS_CLIENT_REASON_MAX) {
      break
    }
    out += char
  }
  return out
}

export type ClaudeModsClientPostBounds = { chars: number; values: number; depth: number }

export const CLAUDE_MODS_CLIENT_POST_BOUNDS: ClaudeModsClientPostBounds = {
  chars: 100_000,
  values: 20_000,
  depth: 32
}

function boundProblem(value: unknown, bounds: ClaudeModsClientPostBounds): string | null {
  let values = 0
  const visit = (item: unknown, depth: number): string | null => {
    values += 1
    if (values > bounds.values) {
      return `the data holds more than ${bounds.values} values`
    }
    if (typeof item !== 'object' || item === null) {
      return null
    }
    if (depth > bounds.depth) {
      return `the data nests deeper than ${bounds.depth}`
    }
    for (const child of Array.isArray(item) ? item : Object.values(item)) {
      const problem = visit(child, depth + 1)
      if (problem) {
        return problem
      }
    }
    return null
  }
  return visit(value, 0)
}

export type ClaudeModsClientPostData = { ok: true; data: unknown } | { ok: false; reason: string }

/** A `surface.post` text read as plain data inside the bounds, or why it is not sent. */
export function readClaudeModsClientPost(
  text: string,
  bounds: ClaudeModsClientPostBounds = CLAUDE_MODS_CLIENT_POST_BOUNDS
): ClaudeModsClientPostData {
  if (text.length > bounds.chars) {
    return {
      ok: false,
      reason: `post: the data serializes to more than ${bounds.chars} characters; not sent`
    }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'post: the data is not plain JSON; not sent' }
  }
  const problem = boundProblem(data, bounds)
  return problem ? { ok: false, reason: `post: ${problem}; not sent` } : { ok: true, data }
}
