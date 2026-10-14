import { describe, expect, it } from 'vitest'
import {
  claudeModsBoxStyle,
  claudeModsColor,
  claudeModsDeclarationStyle,
  claudeModsTextStyle
} from './claude-mods-style'
import {
  collectClaudeModsHotkeys,
  keyedClaudeModsChildren,
  readClaudeModsTree,
  readSelectOptions
} from './claude-mods-tree'

describe('readClaudeModsTree', () => {
  it('reads elements, presses, text and the drawing mod', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      props: { flexDirection: 'row' },
      children: [
        'plain',
        3,
        {
          type: 'Button',
          props: { key: 'more', label: 'Add one' },
          press: { plugin: 'p', handle: 9 }
        }
      ],
      part: { plugin: 'p' }
    })
    expect(tree).toEqual({
      kind: 'element',
      type: 'Box',
      props: { flexDirection: 'row' },
      plugin: 'p',
      children: [
        { kind: 'text', text: 'plain' },
        { kind: 'text', text: '3' },
        {
          kind: 'element',
          type: 'Button',
          props: { key: 'more', label: 'Add one' },
          children: [],
          press: { plugin: 'p', handle: 9 }
        }
      ]
    })
  })

  it('keeps engine nodes and turns unknown or malformed ones into placeholders', () => {
    expect(readClaudeModsTree({ type: 'engine', ref: 0 })).toEqual({ kind: 'engine' })
    expect(readClaudeModsTree({ type: 'Raster', props: {} })).toEqual({
      kind: 'unsupported',
      type: 'Raster'
    })
    expect(readClaudeModsTree(null)).toEqual({ kind: 'unsupported', type: 'malformed node' })
    // A press without an integer handle is dropped, so the control renders disabled.
    expect(
      readClaudeModsTree({ type: 'Button', props: {}, press: { plugin: 'p', handle: '1' } })
    ).not.toHaveProperty('press')
  })

  it('bounds a tree no mod would draw', () => {
    let deep: unknown = 'leaf'
    for (let i = 0; i < 200; i++) {
      deep = { type: 'Box', children: [deep] }
    }
    expect(JSON.stringify(readClaudeModsTree(deep))).toContain('tree too large')
  })

  it('finds hotkeys and keys siblings stably', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      children: [
        { type: 'Button', props: { key: 'a', hotkey: '1' }, press: { plugin: 'p', handle: 1 } },
        { type: 'Button', props: { key: 'b', hotkey: '1' }, press: { plugin: 'p', handle: 2 } },
        { type: 'Text', children: ['x'] },
        { type: 'Text', children: ['y'] }
      ]
    })
    expect(collectClaudeModsHotkeys(tree).get('1')).toEqual({
      press: { plugin: 'p', handle: 1 },
      key: 'a'
    })
    if (tree.kind !== 'element') {
      throw new Error('expected an element')
    }
    expect(keyedClaudeModsChildren(tree.children).map(([key]) => key)).toEqual([
      'Button#a:0',
      'Button#b:0',
      'Text:0',
      'Text:1'
    ])
  })

  it('reads select options, labelling by value when a label is missing', () => {
    expect(
      readSelectOptions({ options: [{ value: 'ts', label: 'TypeScript' }, { value: 'py' }, 4] })
    ).toEqual([
      { value: 'ts', label: 'TypeScript' },
      { value: 'py', label: 'py' }
    ])
  })
})

describe('claude mods styles', () => {
  it('maps theme keys onto chat tokens and rejects anything that is not a color', () => {
    expect(claudeModsColor('warning')).toBe('var(--chat-warning)')
    expect(claudeModsColor('#d97757')).toBe('#d97757')
    expect(claudeModsColor('url(https://x)')).toBeUndefined()
  })

  it('lays out a Box in cells, Ink style', () => {
    expect(claudeModsBoxStyle({ columnGap: 2, padding: 1, width: '50%' })).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      columnGap: 'calc(2 * 0.6em)',
      paddingTop: 'calc(1 * 1.4em)',
      width: '50%'
    })
    expect(claudeModsBoxStyle({ gap: 'md', display: 'none' })).toMatchObject({
      display: 'none',
      columnGap: '0.75rem'
    })
  })

  it('styles Text, swapping colors under inverse', () => {
    expect(claudeModsTextStyle({ color: 'success', bold: true, dimColor: true })).toMatchObject({
      color: 'var(--chat-diff-added)',
      fontWeight: 600,
      opacity: 0.6
    })
    expect(claudeModsTextStyle({ color: 'warning', inverse: true })).toMatchObject({
      color: 'var(--chat-canvas)',
      backgroundColor: 'var(--chat-warning)'
    })
    expect(claudeModsTextStyle({ wrap: 'truncate-end' })).toMatchObject({
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    })
  })

  it('keeps a declaration string from fetching anything', () => {
    expect(
      claudeModsDeclarationStyle('color: red; background-image: url(https://x); font-weight: 600')
    ).toEqual({ color: 'red', fontWeight: '600' })
  })
})
