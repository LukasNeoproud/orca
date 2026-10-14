// Keys a focused site answers: a Button's hotkey, never while the person types in a field.

import {
  collectClaudeModsHotkeys,
  type ClaudeModsNode,
  type ClaudeModsPress
} from './claude-mods-tree'

export function isClaudeModsTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** Elements that keep their own keys: a Select's trigger and its listbox, even when portaled. */
const OWNS_KEYS = '[role="combobox"], [role="listbox"], [role="option"], [role="menu"]'

type HotkeyEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target'> & {
  defaultPrevented?: boolean
  currentTarget?: EventTarget | null
}

/** The Button a key presses in `tree`, matched on the lowercased key ("Shift+w" is "w"). */
export function claudeModsHotkeyTarget(
  tree: ClaudeModsNode,
  event: HotkeyEvent
): { press: ClaudeModsPress; key: string | undefined } | undefined {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.defaultPrevented ||
    isClaudeModsTextField(event.target)
  ) {
    return undefined
  }
  const target = event.target instanceof Element ? event.target : null
  // React bubbles a portaled listbox's keys to the site; they are not the site's.
  const site = event.currentTarget instanceof Node ? event.currentTarget : null
  if (target?.closest(OWNS_KEYS) || (site && target && !site.contains(target))) {
    return undefined
  }
  return collectClaudeModsHotkeys(tree).get(event.key.toLowerCase())
}
