import { buildTerminalShortcutKey, type TerminalShortcutModifier } from './terminal-accessory-keys'

export const TERMINAL_MODIFIER_ORDER: readonly TerminalShortcutModifier[] = ['ctrl', 'alt', 'shift']

export function toggleTerminalModifier(
  pending: readonly TerminalShortcutModifier[],
  modifier: TerminalShortcutModifier
): TerminalShortcutModifier[] {
  const next = new Set(pending)
  if (next.has(modifier)) {
    next.delete(modifier)
  } else {
    next.add(modifier)
  }
  return TERMINAL_MODIFIER_ORDER.filter((item) => next.has(item))
}

export function buildPendingTerminalKey(
  key: string,
  pending: readonly TerminalShortcutModifier[]
): string | null {
  return buildTerminalShortcutKey({ key, modifiers: [...pending] })?.bytes ?? null
}

export function appendedTerminalCharacter(previous: string, next: string): string | null {
  if (!next.startsWith(previous)) {
    return null
  }
  const added = Array.from(next.slice(previous.length))
  return added.length === 1 ? added[0]! : null
}
