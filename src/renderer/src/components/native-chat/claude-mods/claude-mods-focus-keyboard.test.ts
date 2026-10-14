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

  it('ignores auto-repeat and Shift on anything but a digit', () => {
    expect(claudeModsHotkeyTarget(tree, { ...event, repeat: true })).toBeUndefined()
    expect(claudeModsHotkeyTarget(tree, { ...event, shiftKey: true })).toBeUndefined()
    const digits = readClaudeModsTree({
      type: 'Button',
      props: { hotkey: '1' },
      press: { plugin: 'p', handle: 3 }
    })
    expect(claudeModsHotkeyTarget(digits, { ...event, key: '1', shiftKey: true })).toBeDefined()
  })

  it('answers a focused Button', () => {
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: document.createElement('button') })
    ).toBeDefined()
  })

  it('leaves the keys of a Select trigger, its open listbox and portaled content alone', () => {
    const trigger = document.createElement('button')
    trigger.setAttribute('role', 'combobox')
    const option = document.createElement('div')
    option.setAttribute('role', 'option')
    const listbox = document.createElement('div')
    listbox.setAttribute('role', 'listbox')
    listbox.append(option)
    expect(claudeModsHotkeyTarget(tree, { ...event, target: trigger })).toBeUndefined()
    expect(claudeModsHotkeyTarget(tree, { ...event, target: option })).toBeUndefined()
    const site = document.createElement('div')
    const portaled = document.createElement('span')
    document.body.append(portaled)
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: portaled, currentTarget: site })
    ).toBeUndefined()
    const inside = document.createElement('button')
    site.append(inside)
    expect(
      claudeModsHotkeyTarget(tree, { ...event, target: inside, currentTarget: site })
    ).toBeDefined()
  })

  it('skips a key something already handled', () => {
    expect(claudeModsHotkeyTarget(tree, { ...event, defaultPrevented: true })).toBeUndefined()
  })
})
