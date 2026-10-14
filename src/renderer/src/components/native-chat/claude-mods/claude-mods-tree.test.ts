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
      owner: 'p',
      type: 'Box',
      props: { flexDirection: 'row' },
      plugin: 'p',
      children: [
        { kind: 'text', text: 'plain' },
        { kind: 'text', text: '3' },
        {
          kind: 'element',
          owner: 'p',
          type: 'Button',
          props: { key: 'more', label: 'Add one' },
          children: [],
          press: { plugin: 'p', handle: 9 }
        }
      ]
    })
  })

  it('keeps engine nodes and drops what it cannot draw', () => {
    expect(readClaudeModsTree({ type: 'engine', ref: 0 })).toEqual({ kind: 'engine', ref: 0 })
    expect(readClaudeModsTree({ type: 'engine', ref: 3 })).toEqual({ kind: 'engine', ref: 3 })
    // A press without an integer handle is dropped, so the control draws without one.
    expect(
      readClaudeModsTree({ type: 'Button', props: {}, press: { plugin: 'p', handle: '1' } })
    ).not.toHaveProperty('press')
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
    // Two Buttons on one key: the later in drawing order wins.
    expect(collectClaudeModsHotkeys(tree).get('1')).toEqual({
      press: { plugin: 'p', handle: 2 },
      key: 'b'
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

  it('keeps a node’s hover and group, and the mod that drew it', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      part: { plugin: 'notes' },
      children: [
        {
          type: 'Box',
          props: { key: 'row' },
          hover: { backgroundColor: 'warning', scope: 'g' },
          group: { plugin: 'notes' },
          children: [
            {
              type: 'Button',
              props: { key: 'go' },
              press: { plugin: 'notes', handle: 1 },
              hover: { bold: true }
            }
          ]
        }
      ]
    })
    if (tree.kind !== 'element') {
      throw new Error('expected an element')
    }
    const row = tree.children[0]
    if (row?.kind !== 'element') {
      throw new Error('expected an element')
    }
    expect(row).toMatchObject({
      hover: { backgroundColor: 'warning', scope: 'g' },
      group: 'notes',
      owner: 'notes'
    })
    expect(row.children[0]).toMatchObject({ hover: { bold: true }, owner: 'notes' })
    expect(tree).not.toHaveProperty('hover')
    expect(tree).not.toHaveProperty('group')
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
    // A free-form CSS name would draw pure blue on a dark canvas.
    expect(claudeModsColor('rebeccapurple')).toBeUndefined()
    expect(claudeModsColor('constructor')).toBeUndefined()
  })

  it('lays out a Box in cells, Ink style', () => {
    expect(claudeModsBoxStyle({ columnGap: 2, padding: 1, width: '50%' })).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      columnGap: 'calc(2 * 0.6em)',
      paddingTop: 'calc(1 * var(--claude-mods-row-unit, 0.5lh))',
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
      display: 'inline-block',
      maxWidth: '100%',
      minWidth: 0,
      whiteSpace: 'pre',
      textOverflow: 'ellipsis'
    })
  })

  it('keeps a declaration string from fetching anything', () => {
    expect(
      claudeModsDeclarationStyle('color: red; background-image: url(https://x); font-weight: 600')
    ).toEqual({ color: 'red', fontWeight: '600' })
  })

  it('maps text size and weight steps and places a Box against its parent', () => {
    expect(claudeModsTextStyle({ size: 'caption', weight: 'regular' })).toMatchObject({
      fontSize: 'var(--text-2xs)',
      fontWeight: 400
    })
    expect(claudeModsTextStyle({ size: 'title' })).toMatchObject({ fontWeight: 700 })
    expect(claudeModsTextStyle({ size: 'heading', weight: 'medium' })).toMatchObject({
      fontWeight: 500
    })
    expect(claudeModsBoxStyle({})).toMatchObject({ position: 'relative' })
    expect(claudeModsBoxStyle({ position: 'absolute', top: -2.5, left: 3 })).toMatchObject({
      position: 'absolute',
      top: 'calc(-2 * 1lh)',
      left: 'calc(3 * 0.6em)'
    })
  })
})
