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

/** The Button a key presses in `tree`, matched on the lowercased key ("Shift+w" is "w"). */
export function claudeModsHotkeyTarget(
  tree: ClaudeModsNode,
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target'>
): { press: ClaudeModsPress; key: string | undefined } | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey || isClaudeModsTextField(event.target)) {
    return undefined
  }
  return collectClaudeModsHotkeys(tree).get(event.key.toLowerCase())
}
