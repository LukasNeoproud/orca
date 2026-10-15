import { describe, expect, it } from 'vitest'
import { claudeModsBoxStyle, claudeModsTextStyle } from './claude-mods-style'

describe('claudeModsBoxStyle', () => {
  it('spaces vertically in half rows and sizes in whole ones', () => {
    expect(
      claudeModsBoxStyle({ gap: 2, paddingY: 1, marginTop: 3, height: 4, minHeight: 2 })
    ).toMatchObject({
      rowGap: 'calc(2 * var(--claude-mods-row-unit, 0.5lh))',
      columnGap: 'calc(2 * 0.6em)',
      paddingTop: 'calc(1 * var(--claude-mods-row-unit, 0.5lh))',
      marginTop: 'calc(3 * var(--claude-mods-row-unit, 0.5lh))',
      height: 'calc(4 * 1lh)',
      minHeight: 'calc(2 * 1lh)'
    })
  })

  it('draws a border at the radius scale, in the border color', () => {
    expect(claudeModsBoxStyle({ borderStyle: 'single' })).toMatchObject({
      borderTop: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)'
    })
    expect(claudeModsBoxStyle({ borderStyle: 'round' })).toMatchObject({
      borderRadius: 'var(--radius-lg)'
    })
    expect(claudeModsBoxStyle({ borderStyle: 'bold' })).toMatchObject({
      borderLeft: '2px solid var(--border)'
    })
    expect(claudeModsBoxStyle({ borderStyle: 'double' })).toMatchObject({
      borderLeft: '3px double var(--border)'
    })
    expect(claudeModsBoxStyle({ borderStyle: 'classic' })).toMatchObject({
      borderLeft: '1px solid var(--border)'
    })
  })

  it('keeps per-side borders and tints them with the color map', () => {
    const style = claudeModsBoxStyle({
      borderStyle: 'single',
      borderTop: false,
      borderColor: 'error'
    })
    expect(style.borderTop).toBeUndefined()
    expect(style.borderBottom).toBe('1px solid var(--chat-diff-removed)')
  })

  it('pads a bordered Box unless the mod set that side', () => {
    expect(claudeModsBoxStyle({ borderStyle: 'single' })).toMatchObject({
      paddingTop: '0.5rem',
      paddingBottom: '0.5rem',
      paddingLeft: '0.75rem',
      paddingRight: '0.75rem'
    })
    expect(claudeModsBoxStyle({ borderStyle: 'single', paddingX: 1, paddingTop: 0 })).toMatchObject(
      {
        paddingTop: 'calc(0 * var(--claude-mods-row-unit, 0.5lh))',
        paddingBottom: '0.5rem',
        paddingLeft: 'calc(1 * 0.6em)'
      }
    )
    expect(claudeModsBoxStyle({})).not.toHaveProperty('paddingTop')
  })
})

describe('claudeModsTextStyle wrapping', () => {
  it('ellipsises every truncating Text as a shrinkable box that keeps its spaces', () => {
    for (const wrap of ['truncate', 'truncate-end', 'truncate-middle', 'end']) {
      expect(claudeModsTextStyle({ wrap })).toMatchObject({
        display: 'inline-block',
        maxWidth: '100%',
        minWidth: 0,
        whiteSpace: 'pre',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      })
    }
  })

  it('never breaks a short token mid-word, and breaks long words only when it must', () => {
    expect(claudeModsTextStyle({}, 'feat/claude-mods')).toMatchObject({
      overflowWrap: 'break-word',
      whiteSpace: 'pre'
    })
    expect(claudeModsTextStyle({}, 'a few short words here')).toMatchObject({
      overflowWrap: 'break-word',
      whiteSpace: 'pre-wrap'
    })
    expect(claudeModsTextStyle({}, 'x'.repeat(25))).toMatchObject({ overflowWrap: 'anywhere' })
    expect(claudeModsTextStyle({})).toMatchObject({ overflowWrap: 'anywhere' })
  })
})
