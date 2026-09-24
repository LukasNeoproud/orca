import { describe, expect, it } from 'vitest'
import {
  appendedTerminalCharacter,
  buildPendingTerminalKey,
  toggleTerminalModifier
} from './terminal-pending-modifiers'

describe('pending terminal modifiers', () => {
  it('toggles several modifiers independently', () => {
    const ctrl = toggleTerminalModifier([], 'ctrl')
    const combined = toggleTerminalModifier(ctrl, 'alt')
    expect(combined).toEqual(['ctrl', 'alt'])
    expect(toggleTerminalModifier(combined, 'ctrl')).toEqual(['alt'])
  })

  it('uses the existing terminal shortcut encoding', () => {
    expect(buildPendingTerminalKey('c', ['ctrl'])).toBe('\x03')
    expect(buildPendingTerminalKey('c', ['ctrl', 'alt'])).toBe('\x1b\x03')
    expect(buildPendingTerminalKey('arrowUp', ['ctrl', 'shift'])).toBe('\x1b[1;6A')
    expect(buildPendingTerminalKey('1', ['ctrl'])).toBeNull()
  })

  it('captures only one completed appended character', () => {
    expect(appendedTerminalCharacter('abc', 'abcd')).toBe('d')
    expect(appendedTerminalCharacter('abc', 'abcde')).toBeNull()
    expect(appendedTerminalCharacter('abc', 'ab')).toBeNull()
  })
})
