import type { ClaudeModsFillMode } from '../../../../shared/claude-mods-prompt-answers'

export type NativeChatPromptBox = { text: string; cursor: number }

/** Desktop's own bound on a suggestion. */
const MAX_SUGGESTION_LENGTH = 262_144
// Control and format characters other than tab, newline and CR would be accepted unseen.
const UNSEEN_CHARACTER = /[^\P{Cc}\t\n\r]|\p{Cf}/u

function clampCursor(cursor: number, text: string): number {
  return Math.min(Math.max(0, Number.isInteger(cursor) ? cursor : text.length), text.length)
}

/** The box after a mod's fill; the caret ends after the placed text, as the CLI documents. */
export function fillNativeChatPromptBox(
  box: NativeChatPromptBox,
  text: string,
  mode: ClaudeModsFillMode
): NativeChatPromptBox {
  if (mode === 'replace') {
    return { text, cursor: text.length }
  }
  const at = mode === 'append' ? box.text.length : clampCursor(box.cursor, box.text)
  return {
    text: `${box.text.slice(0, at)}${text}${box.text.slice(at)}`,
    cursor: at + text.length
  }
}

/** The suggestion a mod (or the CLI's own guess) may show, or null when Desktop would refuse it. */
export function nativeChatClaudeModsSuggestion(text: string): string | null {
  const normalized = text.normalize('NFC').trim()
  return normalized === '' ||
    normalized.length > MAX_SUGGESTION_LENGTH ||
    UNSEEN_CHARACTER.test(normalized)
    ? null
    : normalized
}

/** One line of ghost text: the placeholder wraps, so line breaks are shown as spaces. */
export function nativeChatClaudeModsSuggestionGhost(suggestion: string): string {
  return suggestion.replace(/\s+/g, ' ')
}

/** Tab or ArrowRight with no modifier takes a shown suggestion, as on Desktop. */
export function isNativeChatSuggestionAcceptKey(event: {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  return (
    (event.key === 'Tab' || event.key === 'ArrowRight') &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
}
