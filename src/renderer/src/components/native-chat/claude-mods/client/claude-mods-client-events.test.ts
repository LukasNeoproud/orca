import { describe, expect, it } from 'vitest'
import {
  claudeModsClientCell,
  claudeModsClientKey,
  claudeModsClientPointer,
  readClaudeModsClientPost,
  releasesClaudeModsClientFocus,
  scrubClaudeModsClientReason
} from './claude-mods-client-events'

const key = (
  name: string,
  mods: Partial<{ ctrl: boolean; shift: boolean; meta: boolean }> = {}
) => ({
  key: name,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false
})

describe('claudeModsClientKey', () => {
  it('names special keys as the terminal does and passes typed characters', () => {
    expect(claudeModsClientKey(key('ArrowUp'))).toEqual({ key: 'up' })
    expect(claudeModsClientKey(key('PageDown'))).toEqual({ key: 'pagedown' })
    expect(claudeModsClientKey(key('Enter'))).toEqual({ key: 'return' })
    expect(claudeModsClientKey(key(' '))).toEqual({ key: 'space' })
    expect(claudeModsClientKey(key('A', { shift: true }))).toEqual({ key: 'A', shift: true })
    expect(claudeModsClientKey(key('k', { ctrl: true, meta: true }))).toEqual({
      key: 'k',
      ctrl: true,
      meta: true
    })
    expect(claudeModsClientKey(key('😀'))).toEqual({ key: '😀' })
  })

  it('delivers no modifier alone and no other named key', () => {
    expect(claudeModsClientKey(key('Shift', { shift: true }))).toBeNull()
    expect(claudeModsClientKey(key('F1'))).toBeNull()
  })

  it('keeps Escape, Ctrl+C and Ctrl+D for the app', () => {
    expect(releasesClaudeModsClientFocus(key('Escape'))).toBe(true)
    expect(releasesClaudeModsClientFocus(key('c', { ctrl: true }))).toBe(true)
    expect(releasesClaudeModsClientFocus(key('d', { ctrl: true }))).toBe(true)
    expect(releasesClaudeModsClientFocus(key('c'))).toBe(false)
  })
})

describe('claudeModsClientPointer', () => {
  const cell = claudeModsClientCell(10)
  const event = {
    clientX: 112.5,
    clientY: 35,
    button: 0,
    shiftKey: false,
    altKey: true,
    ctrlKey: false
  }

  it('reports region cells with the fine position', () => {
    expect(claudeModsClientPointer('down', event, { left: 100, top: 0 }, cell, undefined)).toEqual({
      type: 'down',
      x: 2,
      y: 2,
      fine: { x: 2.083, y: 2.5 },
      button: 'left',
      alt: true
    })
  })

  it('carries the held button on a move and none on a hover move', () => {
    const origin = { left: 0, top: 0 }
    expect(claudeModsClientPointer('move', event, origin, cell, 'right').button).toBe('right')
    expect(claudeModsClientPointer('move', event, origin, cell, undefined).button).toBeUndefined()
  })

  it('reports past the edges while the pointer is held', () => {
    const outside = { ...event, clientX: 90 }
    expect(claudeModsClientPointer('move', outside, { left: 100, top: 0 }, cell, 'left').x).toBe(-2)
  })
})

describe('scrubClaudeModsClientReason', () => {
  it('sends one line of at most 200 characters', () => {
    expect(scrubClaudeModsClientReason('boom\nline two\u0007')).toBe('boom line two')
    expect(scrubClaudeModsClientReason('x'.repeat(500))).toHaveLength(200)
    const emoji = scrubClaudeModsClientReason(`${'x'.repeat(199)}😀`)
    expect(emoji).toBe('x'.repeat(199))
  })
})

describe('readClaudeModsClientPost', () => {
  it('passes plain data inside the bounds', () => {
    expect(readClaudeModsClientPost('{"a":[1,2]}')).toEqual({ ok: true, data: { a: [1, 2] } })
    expect(readClaudeModsClientPost('null')).toEqual({ ok: true, data: null })
  })

  it('refuses data over the bounds the CLI enforces', () => {
    expect(readClaudeModsClientPost(JSON.stringify('x'.repeat(100_001)))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('more than 100000 characters')
    })
    expect(readClaudeModsClientPost(JSON.stringify(Array(20_001).fill(0)))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('more than 20000 values')
    })
    let deep: unknown = 0
    for (let index = 0; index < 40; index += 1) {
      deep = [deep]
    }
    expect(readClaudeModsClientPost(JSON.stringify(deep))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('deeper than 32')
    })
  })
})
