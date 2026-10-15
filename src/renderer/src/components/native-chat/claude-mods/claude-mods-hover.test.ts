import { describe, expect, it } from 'vitest'
import {
  ClaudeModsHoverStore,
  claudeModsBoxHoverId,
  claudeModsGroupHoverId,
  isClaudeModsHoverKey
} from './claude-mods-hover-store'
import {
  claudeModsHoveredBoxProps,
  claudeModsHoveredBoxStyle,
  claudeModsHoveredTextProps,
  claudeModsHoverScope
} from './claude-mods-hover-style'

describe('ClaudeModsHoverStore', () => {
  it('lights a keyed Box while the pointer is over it', () => {
    const store = new ClaudeModsHoverStore()
    const row = claudeModsBoxHoverId('row')
    expect(store.isLit(row, null)).toBe(false)
    store.enter([row])
    expect(store.isLit(row, null)).toBe(true)
    expect(store.isLit(claudeModsBoxHoverId('other'), null)).toBe(false)
    store.leave([row])
    expect(store.isLit(row, null)).toBe(false)
  })

  it('lights a whole group from any one member, across sites', () => {
    const store = new ClaudeModsHoverStore()
    const group = claudeModsGroupHoverId('notes', 'row-3')
    const paneMember = claudeModsBoxHoverId('pane-row')
    const transcriptMark = claudeModsBoxHoverId('transcript-mark')
    store.enter([paneMember, group])
    expect(store.isLit(transcriptMark, group)).toBe(true)
    expect(store.isLit(transcriptMark, null)).toBe(false)
  })

  it('keeps a group lit until every member the pointer is over has left', () => {
    const store = new ClaudeModsHoverStore()
    const group = claudeModsGroupHoverId('notes', 'g')
    store.enter([group])
    store.enter([group])
    store.leave([group])
    expect(store.isLit(null, group)).toBe(true)
    store.leave([group])
    expect(store.isLit(null, group)).toBe(false)
  })

  it('keeps two plugins’ groups of one scope apart', () => {
    const store = new ClaudeModsHoverStore()
    store.enter([claudeModsGroupHoverId('notes', 'g')])
    expect(store.isLit(null, claudeModsGroupHoverId('other', 'g'))).toBe(false)
  })

  it('wakes subscribers only when something lit or went dark', () => {
    const store = new ClaudeModsHoverStore()
    let wakes = 0
    const stop = store.subscribe(() => {
      wakes += 1
    })
    store.enter(['a'])
    store.enter(['a'])
    store.leave(['a'])
    store.leave(['a'])
    expect(wakes).toBe(2)
    stop()
    store.enter(['a'])
    expect(wakes).toBe(2)
  })

  it('takes a key only the way the engine names a hover context', () => {
    expect(isClaudeModsHoverKey('row-1')).toBe(true)
    expect(isClaudeModsHoverKey('')).toBe(false)
    expect(isClaudeModsHoverKey('a\nb')).toBe(false)
    expect(isClaudeModsHoverKey(3)).toBe(false)
  })
})

describe('claudeModsHoveredBoxProps', () => {
  it('reveals a Box drawn none and recolours', () => {
    const result = claudeModsHoveredBoxProps(
      { display: 'none', backgroundColor: 'background' },
      { display: 'flex', backgroundColor: 'warning', scope: 'g' }
    )
    expect(result).toEqual({
      props: { display: 'flex', backgroundColor: 'warning' },
      revealed: true
    })
  })

  it('refuses what would move a sibling: a new border, a hide, offsets of a Box in flow', () => {
    const result = claudeModsHoveredBoxProps(
      { display: 'flex' },
      { borderStyle: 'round', display: 'none', top: 3, left: 2 }
    )
    expect(result).toEqual({ props: { display: 'flex' }, revealed: false })
  })

  it('moves a placed Box by whole cells and restyles an existing border', () => {
    const result = claudeModsHoveredBoxProps(
      { position: 'absolute', top: 1, borderStyle: 'single' },
      { top: -2.7, left: 4, borderStyle: 'double', borderColor: 'error' }
    )
    expect(result.props).toMatchObject({
      top: -2,
      left: 4,
      borderStyle: 'double',
      borderColor: 'error'
    })
  })

  it('swaps a border to double or bold at the width it rested at', () => {
    for (const borderStyle of ['double', 'bold']) {
      const style = claudeModsHoveredBoxStyle(
        { borderStyle: 'single', borderColor: 'success' },
        { borderStyle, borderColor: 'error' },
        true
      )
      const resting = claudeModsHoveredBoxStyle({ borderStyle: 'single' }, undefined, false)
      for (const side of ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'] as const) {
        expect(String(style[side]).split(' ')[0]).toBe(String(resting[side]).split(' ')[0])
      }
      expect(String(style.borderTop)).toContain(borderStyle === 'double' ? 'double' : 'solid')
    }
  })

  it('draws a reveal out of the flow so no sibling reflows, and the rest as drawn', () => {
    const hover = { display: 'flex' }
    expect(claudeModsHoveredBoxStyle({ display: 'none' }, hover, true)).toMatchObject({
      display: 'flex',
      position: 'absolute'
    })
    expect(claudeModsHoveredBoxStyle({ display: 'none' }, hover, false)).toMatchObject({
      display: 'none',
      position: 'relative'
    })
    expect(
      claudeModsHoveredBoxStyle({ display: 'none', position: 'absolute', top: 2 }, hover, true)
    ).toMatchObject({ position: 'absolute', display: 'flex' })
  })
})

describe('claudeModsHoveredTextProps', () => {
  it('lays only the text keys over a Text or a Button label', () => {
    expect(
      claudeModsHoveredTextProps(
        { dimColor: true },
        { dimColor: false, bold: true, color: 'success', size: 'title', scope: 'g' }
      )
    ).toEqual({ dimColor: false, bold: true, color: 'success' })
  })

  it('reads a scope only when it is a bounded string', () => {
    expect(claudeModsHoverScope({ scope: 'g' })).toBe('g')
    expect(claudeModsHoverScope({ scope: '' })).toBeUndefined()
    expect(claudeModsHoverScope({ scope: 'x'.repeat(65) })).toBeUndefined()
    expect(claudeModsHoverScope(undefined)).toBeUndefined()
  })
})
