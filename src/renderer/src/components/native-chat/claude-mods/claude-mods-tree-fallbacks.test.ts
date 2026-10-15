import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeModsColor } from './claude-mods-style'
import { readClaudeModsTree } from './claude-mods-tree'

afterEach(() => vi.restoreAllMocks())

describe('readClaudeModsTree fallbacks', () => {
  it('draws the children of an unknown type without the wrapper', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tree = readClaudeModsTree({
      type: 'Box',
      children: [
        'a',
        {
          type: 'Static',
          children: [
            'b',
            { type: 'Button', props: { label: 'go' }, press: { plugin: 'p', handle: 1 } }
          ]
        }
      ]
    })
    expect(tree).toMatchObject({
      type: 'Box',
      children: [
        { kind: 'text', text: 'a' },
        { kind: 'text', text: 'b' },
        { kind: 'element', type: 'Button', press: { plugin: 'p', handle: 1 } }
      ]
    })
  })

  it('draws a Newline as a line break, repeated by count', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      children: [{ type: 'Newline' }, { type: 'Newline', props: { count: 3 } }]
    })
    expect(tree).toMatchObject({
      children: [
        { kind: 'text', text: '\n' },
        { kind: 'text', text: '\n\n\n' }
      ]
    })
  })

  it('draws nothing for a malformed node, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tree = readClaudeModsTree({ type: 'Box', children: [null, 4.5, { props: {} }, [], null] })
    expect(tree).toMatchObject({ children: [{ kind: 'text', text: '4.5' }] })
    readClaudeModsTree({ type: 'Box', children: [null] })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('malformed node')
  })

  it('holds a root that left several nodes in one Box, and none as empty text', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readClaudeModsTree({ type: 'Fragment', children: ['x', 'y'] })).toMatchObject({
      type: 'Box',
      children: [
        { kind: 'text', text: 'x' },
        { kind: 'text', text: 'y' }
      ]
    })
    expect(readClaudeModsTree({ type: 'Fragment', children: ['x'] })).toEqual({
      kind: 'text',
      text: 'x'
    })
    expect(readClaudeModsTree(undefined)).toEqual({ kind: 'text', text: '' })
  })

  it('does not draw a tree over the limits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let deep: unknown = 'leaf'
    for (let i = 0; i < 200; i++) {
      deep = { type: 'Box', children: [deep] }
    }
    expect(readClaudeModsTree(deep)).toEqual({ kind: 'text', text: '' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('marks an ASCII-art Text and its unwrapped neighbours as monospace', () => {
    const text = (value: string, wrap?: string): unknown => ({
      type: 'Text',
      props: wrap ? { wrap } : {},
      children: [value]
    })
    const tree = readClaudeModsTree({
      type: 'Box',
      props: { flexDirection: 'column' },
      children: [
        text('plain', 'truncate'),
        text('+--+  |  |', 'truncate'),
        text('▇▇▇', 'truncate'),
        text('wrapping prose'),
        text('after', 'truncate')
      ]
    })
    const monos =
      tree.kind === 'element'
        ? tree.children.map((c) => c.kind === 'element' && c.props.mono === true)
        : []
    expect(monos).toEqual([true, true, true, false, false])
  })

  it('keeps proportional text proportional, and finds art inside a multi-line string', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      props: { flexDirection: 'column' },
      children: [
        { type: 'Text', children: ['A plain sentence, with two  spaces once.'] },
        { type: 'Text', children: ['name    count\nfoo     12'] }
      ]
    })
    const [prose, table] = tree.kind === 'element' ? tree.children : []
    expect(prose).toMatchObject({ props: {} })
    expect(table).toMatchObject({ props: { mono: true } })
  })
})

describe('claudeModsColor hues', () => {
  it('keeps the hue of a theme key and of an ANSI name', () => {
    expect(claudeModsColor('permission')).toBe('var(--chat-accent)')
    expect(claudeModsColor('claude')).toBe('var(--chat-brand)')
    expect(claudeModsColor('autoAccept')).toBe('var(--chat-pro)')
    expect(claudeModsColor('merged')).toBe('var(--chat-merged)')
    expect(claudeModsColor('blueBright')).toBe('var(--chat-accent)')
    expect(claudeModsColor('ansi:magenta')).toBe('var(--chat-pro)')
    expect(claudeModsColor('rainbow_red')).toBe('#eb5f57')
  })
})
