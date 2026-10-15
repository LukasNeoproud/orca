import { describe, expect, it } from 'vitest'
import {
  claudeModsAskDefaultAnswer,
  readClaudeModsAsk,
  readClaudeModsAskAnswer
} from './claude-mods-prompt-answers'

// Request bodies as Claude Code 2.1.300 sent them to the probe (`--scenario prompt-asks`).
const COPY = {
  subtype: 'ui_copy',
  surface: 'desktop',
  client_id: 'orca',
  plugin: 'prompt-asks',
  text: 'copied'
}

describe('readClaudeModsAsk', () => {
  it('reads each ask the CLI sends', () => {
    expect(readClaudeModsAsk('a', COPY)).toEqual({ id: 'a', subtype: 'ui_copy', text: 'copied' })
    expect(readClaudeModsAsk('b', { subtype: 'ui_prompt_read', client_id: 'orca' })).toEqual({
      id: 'b',
      subtype: 'ui_prompt_read'
    })
    expect(
      readClaudeModsAsk('c', { subtype: 'ui_prompt_fill', text: 'x', mode: 'insert' })
    ).toEqual({ id: 'c', subtype: 'ui_prompt_fill', text: 'x', mode: 'insert' })
    expect(readClaudeModsAsk('d', { subtype: 'ui_prompt_suggest', text: 'run' })).toEqual({
      id: 'd',
      subtype: 'ui_prompt_suggest',
      text: 'run'
    })
  })

  it('fills over the draft when the mode is left out', () => {
    expect(readClaudeModsAsk('a', { subtype: 'ui_prompt_fill', text: 'x' })).toMatchObject({
      mode: 'replace'
    })
  })

  it('refuses asks Orca does not answer, unknown modes and oversized text', () => {
    expect(readClaudeModsAsk('a', { subtype: 'ui_read_selection' })).toBeNull()
    expect(
      readClaudeModsAsk('a', { subtype: 'ui_prompt_fill', text: 'x', mode: 'prepend' })
    ).toBeNull()
    expect(readClaudeModsAsk('a', { subtype: 'ui_copy' })).toBeNull()
    expect(readClaudeModsAsk('a', { subtype: 'ui_copy', text: 'x'.repeat(300_001) })).toBeNull()
  })
})

describe('readClaudeModsAskAnswer', () => {
  it('keeps a well-formed answer and drops extra fields', () => {
    expect(readClaudeModsAskAnswer('ui_copy', { copied: true, extra: 1 })).toEqual({ copied: true })
    expect(readClaudeModsAskAnswer('ui_prompt_read', { text: 'ab', cursor: 1 })).toEqual({
      text: 'ab',
      cursor: 1
    })
    expect(readClaudeModsAskAnswer('ui_prompt_fill', { filled: false })).toEqual({ filled: false })
    expect(readClaudeModsAskAnswer('ui_prompt_suggest', { shown: true })).toEqual({ shown: true })
  })

  it('answers the default for a malformed answer, as Desktop does for a bad read', () => {
    expect(readClaudeModsAskAnswer('ui_prompt_read', { text: 'ab', cursor: 3 })).toEqual({
      text: '',
      cursor: 0
    })
    expect(readClaudeModsAskAnswer('ui_prompt_read', { text: 'ab', cursor: 0.5 })).toEqual({
      text: '',
      cursor: 0
    })
    expect(readClaudeModsAskAnswer('ui_copy', { copied: 'yes' })).toEqual({ copied: false })
    expect(readClaudeModsAskAnswer('ui_prompt_suggest', null)).toEqual(
      claudeModsAskDefaultAnswer('ui_prompt_suggest')
    )
  })
})
