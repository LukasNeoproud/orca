import { describe, expect, it } from 'vitest'
import { CLAUDE_MODS_CLIENT_DEFAULT_LIMITS } from './claude-mods-client-bundle'
import { readClaudeModsClientTree } from './claude-mods-client-tree'

const LIMITS = CLAUDE_MODS_CLIENT_DEFAULT_LIMITS

// The board's first render as the CLI's own runtime exported it under Chromium.
const BOARD_TEXT = JSON.stringify({
  type: 'Box',
  props: { flexDirection: 'column', key: 'root' },
  hover: { borderColor: 'warning' },
  children: [
    { type: 'Text', props: { bold: true }, children: ['L:Hello', ' ticks=', '0'] },
    { type: 'Button', props: { key: 'go', label: 'Go' }, held: 1 },
    { type: 'Input', props: { key: 'name', label: 'Name', value: 'x' }, held: 2 },
    {
      type: 'Select',
      props: { key: 'pick', options: [{ value: 'a', label: 'A' }, { value: 'b' }], value: 'a' },
      held: 3
    }
  ]
})

describe('readClaudeModsClientTree', () => {
  it('turns each held closure into a press of the drawing plugin', () => {
    const drawn = readClaudeModsClientTree(BOARD_TEXT, 'board', LIMITS)
    expect(drawn.ok).toBe(true)
    if (!drawn.ok || drawn.tree.kind !== 'element') {
      return
    }
    expect(drawn.handles).toEqual([1, 2, 3])
    expect(drawn.tree.plugin).toBe('board')
    const [, button, input] = drawn.tree.children
    expect(button).toMatchObject({ type: 'Button', press: { plugin: 'board', handle: 1 } })
    expect(input).toMatchObject({ type: 'Input', press: { plugin: 'board', handle: 2 } })
  })

  it('keeps a scoped hover in the drawing plugin own group', () => {
    const text = JSON.stringify({ type: 'Box', props: { key: 'k' }, hover: { scope: 'row' } })
    const drawn = readClaudeModsClientTree(text, 'board', LIMITS)
    expect(drawn.ok && drawn.tree.kind === 'element' && drawn.tree.group).toBe('board')
  })

  it('draws a bare string root as text', () => {
    expect(readClaudeModsClientTree('"just a string"', 'board', LIMITS)).toMatchObject({
      ok: true,
      tree: { kind: 'text', text: 'just a string' },
      handles: []
    })
  })

  it('refuses what a surface module cannot draw', () => {
    const refused = (value: unknown): string | undefined => {
      const drawn = readClaudeModsClientTree(JSON.stringify(value), 'board', LIMITS)
      return drawn.ok ? undefined : drawn.reason
    }
    expect(refused({ type: 'Client', props: {} })).toContain('an element Client')
    expect(refused({ type: 'engine', ref: 1 })).toContain('an element engine')
    expect(refused({ type: 'div' })).toContain('an element div')
    expect(refused({ type: 'Button', props: { label: 'x' } })).toContain('without its handler')
    expect(refused({ type: 'Box', children: [3] })).toContain('neither a string nor an element')
    expect(readClaudeModsClientTree('{', 'board', LIMITS)).toMatchObject({ ok: false })
  })

  it('bounds the text, the nodes and the depth', () => {
    const tight = { ...LIMITS, chars: 10, nodes: 2, depth: 1 }
    expect(readClaudeModsClientTree(BOARD_TEXT, 'board', tight)).toMatchObject({ ok: false })
    const loose = { ...LIMITS, nodes: 2 }
    const many = JSON.stringify({ type: 'Box', children: [{ type: 'Text' }, { type: 'Text' }] })
    expect(readClaudeModsClientTree(many, 'board', loose)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('more than 2 nodes')
    })
    const deep = JSON.stringify({
      type: 'Box',
      children: [{ type: 'Box', children: [{ type: 'Box' }] }]
    })
    expect(readClaudeModsClientTree(deep, 'board', { ...LIMITS, depth: 1 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('deeper than 1')
    })
  })
})
