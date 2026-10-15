import { describe, expect, it } from 'vitest'
import { MAX_CLAUDE_MODS_REQUEST_BYTES } from '../../../../../shared/rpc-contract/claude-mods-surface-params'
import {
  fitClaudeModsAskProps,
  restoreClaudeModsCutStrings
} from './claude-mods-transcript-ask-bounds'
import { claudeModsToolGroup } from './claude-mods-transcript-props'
import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../../shared/native-chat-types'

const size = (value: unknown): number => JSON.stringify(value).length

describe('fitClaudeModsAskProps', () => {
  it('leaves a small ask as it is', () => {
    const props = { text: 'hello', isFirstOfReply: true }
    expect(fitClaudeModsAskProps(props)).toBe(props)
  })

  it('cuts a 200K-character message to fit and keeps the other fields', () => {
    const fitted = fitClaudeModsAskProps({ text: 'x'.repeat(200_000), isExpanded: true })
    expect(size(fitted)).toBeLessThan(MAX_CLAUDE_MODS_REQUEST_BYTES)
    expect(fitted.isExpanded).toBe(true)
    expect(String(fitted.text).length).toBeGreaterThan(50_000)
  })

  it('counts the JSON escaping of the text, not its length', () => {
    const fitted = fitClaudeModsAskProps({ text: '\u0000'.repeat(100_000) })
    expect(size(fitted)).toBeLessThan(MAX_CLAUDE_MODS_REQUEST_BYTES)
    expect(String(fitted.text).length).toBeGreaterThan(0)
  })

  it('fits a group of many calls with large outputs, keeping its first calls', () => {
    const calls = Array.from({ length: 400 }, (_, index): NativeChatToolCallBlock => ({
      type: 'tool-call',
      name: 'Read',
      input: { file_path: `/f${index}` },
      callId: `toolu_${index}`
    }))
    const results = new Map(
      calls.map((entry): [NativeChatToolCallBlock, NativeChatToolResultBlock] => [
        entry,
        { type: 'tool-result', output: 'y'.repeat(20_000), callId: entry.callId }
      ])
    )
    const group = claudeModsToolGroup(calls, results, {
      activeTurnIsWorking: false,
      isActive: false,
      isExpanded: false
    })
    expect(size(group?.props)).toBeGreaterThan(MAX_CLAUDE_MODS_REQUEST_BYTES)
    const fitted = fitClaudeModsAskProps(group?.props ?? {})
    expect(size(fitted)).toBeLessThan(MAX_CLAUDE_MODS_REQUEST_BYTES)
    const kept = fitted.calls
    expect(Array.isArray(kept) && kept[0]).toMatchObject({ tool_use_id: 'toolu_0' })
    expect(fitted.isExpanded).toBe(false)
  })

  it('never cuts a surrogate pair in half', () => {
    const fitted = fitClaudeModsAskProps({
      text: `${'x'.repeat(96 * 1024 - 1)}😀${'z'.repeat(60_000)}`
    })
    expect(String(fitted.text)).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})

describe('restoreClaudeModsCutStrings', () => {
  it('gives the original back for a cut string the mod passed through', () => {
    const original = { text: 'long long text' }
    const sent = { text: 'long' }
    expect(restoreClaudeModsCutStrings({ text: 'long' }, original, sent)).toEqual(original)
  })

  it('keeps a string the mod wrote itself', () => {
    const original = { text: 'long long text' }
    const sent = { text: 'long' }
    expect(restoreClaudeModsCutStrings({ text: 'reworded' }, original, sent)).toEqual({
      text: 'reworded'
    })
  })
})
