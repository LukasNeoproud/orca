import { describe, expect, it } from 'vitest'
import {
  fillNativeChatPromptBox,
  isNativeChatSuggestionAcceptKey,
  nativeChatClaudeModsSuggestion,
  nativeChatClaudeModsSuggestionGhost
} from './native-chat-claude-mods-prompt-box'

const NO_MODIFIERS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }

describe('fillNativeChatPromptBox', () => {
  const box = { text: 'hello world', cursor: 5 }

  it('replaces, appends at the end, or inserts at the caret, with the caret after the text', () => {
    expect(fillNativeChatPromptBox(box, 'new', 'replace')).toEqual({ text: 'new', cursor: 3 })
    expect(fillNativeChatPromptBox(box, '!', 'append')).toEqual({
      text: 'hello world!',
      cursor: 12
    })
    expect(fillNativeChatPromptBox(box, ',', 'insert')).toEqual({ text: 'hello, world', cursor: 6 })
  })

  it('only moves the caret for empty text, and clamps a stale caret', () => {
    expect(fillNativeChatPromptBox(box, '', 'append')).toEqual({ text: 'hello world', cursor: 11 })
    expect(fillNativeChatPromptBox({ text: 'ab', cursor: 9 }, 'c', 'insert')).toEqual({
      text: 'abc',
      cursor: 3
    })
  })
})

describe('nativeChatClaudeModsSuggestion', () => {
  it('trims and keeps a visible suggestion', () => {
    expect(nativeChatClaudeModsSuggestion('  run the tests\n')).toBe('run the tests')
    expect(nativeChatClaudeModsSuggestion('line one\n\tline two')).toBe('line one\n\tline two')
  })

  it('refuses blank text and characters the person would accept unseen', () => {
    expect(nativeChatClaudeModsSuggestion('   ')).toBeNull()
    expect(nativeChatClaudeModsSuggestion('run\u0007')).toBeNull()
    expect(nativeChatClaudeModsSuggestion('ru​n')).toBeNull()
    expect(nativeChatClaudeModsSuggestion('x'.repeat(262_145))).toBeNull()
  })

  it('shows a multi-line suggestion on one line', () => {
    expect(nativeChatClaudeModsSuggestionGhost('one\n\ntwo  three')).toBe('one two three')
  })
})

describe('isNativeChatSuggestionAcceptKey', () => {
  it('takes Tab and ArrowRight without modifiers only', () => {
    expect(isNativeChatSuggestionAcceptKey({ key: 'Tab', ...NO_MODIFIERS })).toBe(true)
    expect(isNativeChatSuggestionAcceptKey({ key: 'ArrowRight', ...NO_MODIFIERS })).toBe(true)
    expect(isNativeChatSuggestionAcceptKey({ key: 'Tab', ...NO_MODIFIERS, shiftKey: true })).toBe(
      false
    )
    expect(isNativeChatSuggestionAcceptKey({ key: 'Tab', ...NO_MODIFIERS, ctrlKey: true })).toBe(
      false
    )
    expect(isNativeChatSuggestionAcceptKey({ key: 'Enter', ...NO_MODIFIERS })).toBe(false)
  })
})
