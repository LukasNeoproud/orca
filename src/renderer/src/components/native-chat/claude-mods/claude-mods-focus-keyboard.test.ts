// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { claudeModsHotkeyTarget } from './claude-mods-focus-keyboard'
import { readClaudeModsTree } from './claude-mods-tree'

const tree = readClaudeModsTree({
  type: 'Box',
  children: [
    { type: 'Button', props: { key: 'first', hotkey: 'y' }, press: { plugin: 'p', handle: 1 } },
    { type: 'Button', props: { key: 'later', hotkey: 'y' }, press: { plugin: 'p', handle: 2 } }
  ]
})
const event = { key: 'Y', metaKey: false, ctrlKey: false, altKey: false, target: null }

describe('claudeModsHotkeyTarget', () => {
  it('presses the later of two Buttons on one key, matching shifted keys', () => {
    expect(claudeModsHotkeyTarget(tree, event)).toEqual({
      press: { plugin: 'p', handle: 2 },
      key: 'later'
    })
  })

  it('stays quiet while the person types in a field or holds a modifier', () => {
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: document.createElement('input') })
    ).toBeUndefined()
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: document.createElement('textarea') })
    ).toBeUndefined()
    expect(claudeModsHotkeyTarget(tree, { ...event, metaKey: true })).toBeUndefined()
    expect(claudeModsHotkeyTarget(tree, { ...event, key: 'n' })).toBeUndefined()
  })

  it('answers a focused Button', () => {
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: document.createElement('button') })
    ).toBeDefined()
  })
})
