// What an Escape inside a mods site does, after Claude Desktop: a field gives the keyboard back
// to the composer, the site itself closes (`close_on_escape`) or does the same, and anything
// that owns Escape on its own (an open list, menu or dialog) keeps it.

import { isClaudeModsTextField } from './claude-mods-focus-keyboard'
import { latchClaudeModsEscapeRepeat } from './claude-mods-escape-latch'

export type ClaudeModsSiteEscape = 'ignore' | 'leave-field' | 'leave-site'

const OWNS_ESCAPE =
  '[role="listbox"], [role="menu"], [role="dialog"], [role="alertdialog"], [data-escape-owner], [role="combobox"][aria-expanded="true"]'

type EscapeEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'repeat'
  | 'defaultPrevented'
  | 'isComposing'
  | 'keyCode'
  | 'ctrlKey'
  | 'metaKey'
  | 'altKey'
  | 'shiftKey'
  | 'target'
>

export function claudeModsSiteEscape(event: EscapeEvent): ClaudeModsSiteEscape {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return 'ignore'
  }
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(OWNS_ESCAPE)) {
    return 'ignore'
  }
  return isClaudeModsTextField(target) ? 'leave-field' : 'leave-site'
}

/**
 * Handles a key that reached a site's root; true when it was an Escape, which nothing else in
 * the site acts on. `leaveSite` runs for an Escape on the site itself, e.g. closing a
 * `close_on_escape` pane; a field only gives the keyboard back. Either way the key's auto-repeat
 * cannot reach the composer and interrupt the agent.
 */
export function handleClaudeModsSiteEscape(
  event: { nativeEvent: EscapeEvent; preventDefault: () => void; stopPropagation: () => void },
  focusComposer: () => void,
  leaveSite?: () => void
): boolean {
  const escape = claudeModsSiteEscape(event.nativeEvent)
  if (escape === 'ignore') {
    return event.nativeEvent.key === 'Escape'
  }
  event.preventDefault()
  event.stopPropagation()
  latchClaudeModsEscapeRepeat()
  const { target } = event.nativeEvent
  if (escape === 'leave-field' && target instanceof HTMLElement) {
    target.blur()
  } else {
    leaveSite?.()
  }
  focusComposer()
  return true
}
