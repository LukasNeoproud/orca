import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TERMINAL_ACCESSORY_LAYOUT_STORAGE_KEY,
  createTerminalAccessoryLayoutPreference,
  getDefaultTerminalAccessoryBuiltInIds,
  getDefaultTerminalAccessoryLayout,
  getVisibleTerminalAccessoryRows,
  loadTerminalAccessoryLayout,
  moveTerminalAccessoryKey,
  normalizeTerminalAccessoryLayoutPreference,
  saveTerminalAccessoryLayout,
  setTerminalAccessoryBuiltInVisible,
  setTerminalAccessoryRowCount
} from './terminal-accessory-layout'

const asyncStorageMock = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorageMock }))

const builtIns = ['ctrl', 'alt', 'shift', 'escape', 'tab', 'space', 'enter']
const legacyBuiltIns = ['escape', 'tab', 'space', 'enter']

beforeEach(() => {
  asyncStorageMock.getItem.mockReset()
  asyncStorageMock.setItem.mockReset()
})

describe('terminal accessory layout v3', () => {
  it('defaults to one visible row of built-in keys', () => {
    expect(getDefaultTerminalAccessoryLayout()).toEqual({
      rows: [getDefaultTerminalAccessoryBuiltInIds()],
      visibleBuiltInIds: getDefaultTerminalAccessoryBuiltInIds()
    })
  })

  it('migrates a v2 custom order, hidden keys, and custom shortcuts', () => {
    expect(
      normalizeTerminalAccessoryLayoutPreference(
        {
          version: 2,
          orderedBuiltInIds: ['enter', 'tab', 'escape', 'space'],
          visibleBuiltInIds: ['enter', 'escape']
        },
        builtIns,
        ['custom-one', 'custom-two']
      )
    ).toEqual({
      version: 3,
      rows: [
        ['ctrl', 'alt', 'shift', 'enter', 'tab', 'escape', 'space', 'custom-one', 'custom-two']
      ],
      visibleBuiltInIds: ['ctrl', 'alt', 'shift', 'enter', 'escape']
    })
  })

  it('migrates v1 visibility and shows only newly added built-ins', () => {
    expect(
      normalizeTerminalAccessoryLayoutPreference(
        {
          version: 1,
          visibleBuiltInIds: ['tab'],
          knownBuiltInIds: legacyBuiltIns
        },
        builtIns,
        ['custom-one']
      )
    ).toEqual({
      version: 3,
      rows: [[...builtIns, 'custom-one']],
      visibleBuiltInIds: ['ctrl', 'alt', 'shift', 'tab']
    })
  })

  it('removes stale and duplicate row references and inserts new built-ins near canonical neighbors', () => {
    expect(
      normalizeTerminalAccessoryLayoutPreference(
        {
          version: 3,
          rows: [
            ['enter', 'custom-one', 'tab'],
            ['escape', 'custom-one', 'removed']
          ],
          visibleBuiltInIds: ['enter', 'escape', 'removed']
        },
        builtIns,
        ['custom-one', 'custom-two']
      )
    ).toEqual({
      version: 3,
      rows: [
        ['ctrl', 'alt', 'shift', 'enter', 'custom-one', 'tab', 'space', 'custom-two'],
        ['escape']
      ],
      visibleBuiltInIds: ['ctrl', 'alt', 'shift', 'enter', 'space', 'escape']
    })
  })

  it('preserves hidden built-ins and visible custom keys when filtering rows', () => {
    const layout = {
      rows: [
        ['escape', 'custom-one'],
        ['tab', 'custom-two']
      ],
      visibleBuiltInIds: ['tab']
    }
    expect(getVisibleTerminalAccessoryRows(layout, ['custom-one', 'custom-two'])).toEqual([
      ['custom-one'],
      ['tab', 'custom-two']
    ])
    expect(
      setTerminalAccessoryBuiltInVisible(
        layout,
        'escape',
        true,
        ['escape', 'tab'],
        ['custom-one', 'custom-two']
      )
    ).toEqual({
      rows: layout.rows,
      visibleBuiltInIds: ['escape', 'tab']
    })
  })

  it('moves built-in and custom keys between rows independently of screen width', () => {
    const layout = {
      rows: [['escape', 'custom-one'], ['tab'], []],
      visibleBuiltInIds: ['escape', 'tab']
    }
    expect(
      moveTerminalAccessoryKey(layout, 'custom-one', 2, 0, ['escape', 'tab'], ['custom-one'])
    ).toEqual({
      rows: [['escape'], ['tab'], ['custom-one']],
      visibleBuiltInIds: ['escape', 'tab']
    })
    expect(
      moveTerminalAccessoryKey(layout, 'escape', 1, 0, ['escape', 'tab'], ['custom-one']).rows
    ).toEqual([['custom-one'], ['escape', 'tab'], []])
  })

  it('appends removed rows in order when reducing row count', () => {
    const layout = {
      rows: [['escape'], ['custom-one', 'tab'], ['custom-two', 'enter']],
      visibleBuiltInIds: ['escape', 'tab', 'enter']
    }
    expect(
      setTerminalAccessoryRowCount(
        layout,
        2,
        ['escape', 'tab', 'enter'],
        ['custom-one', 'custom-two']
      ).rows
    ).toEqual([['escape'], ['custom-one', 'tab', 'custom-two', 'enter']])
    expect(
      setTerminalAccessoryRowCount(
        layout,
        1,
        ['escape', 'tab', 'enter'],
        ['custom-one', 'custom-two']
      ).rows
    ).toEqual([['escape', 'custom-one', 'tab', 'custom-two', 'enter']])
  })

  it('adds a new custom key to row one and removes deleted custom keys', () => {
    const layout = { rows: [['escape'], ['custom-old']], visibleBuiltInIds: ['escape'] }
    expect(
      createTerminalAccessoryLayoutPreference(layout, ['escape'], ['custom-old', 'custom-new']).rows
    ).toEqual([['escape', 'custom-new'], ['custom-old']])
    expect(createTerminalAccessoryLayoutPreference(layout, ['escape'], []).rows).toEqual([
      ['escape'],
      []
    ])
  })

  it('loads and saves v3 layout with custom order after restart', async () => {
    const layout = { rows: [['custom-one', 'escape'], ['tab']], visibleBuiltInIds: ['tab'] }
    asyncStorageMock.setItem.mockResolvedValue(undefined)
    await saveTerminalAccessoryLayout(layout, ['custom-one'])
    const saved = asyncStorageMock.setItem.mock.calls[0]?.[1] as string
    expect(JSON.parse(saved)).toEqual(
      createTerminalAccessoryLayoutPreference(layout, undefined, ['custom-one'])
    )
    asyncStorageMock.getItem.mockResolvedValue(saved)
    await expect(loadTerminalAccessoryLayout(['custom-one'])).resolves.toEqual(
      createTerminalAccessoryLayoutPreference(layout, undefined, ['custom-one'])
    )
  })

  it('falls back on corrupt storage and rejects write failures', async () => {
    asyncStorageMock.getItem.mockResolvedValue('{')
    await expect(loadTerminalAccessoryLayout()).resolves.toEqual(
      createTerminalAccessoryLayoutPreference(getDefaultTerminalAccessoryLayout())
    )
    asyncStorageMock.setItem.mockRejectedValue(new Error('storage failed'))
    await expect(saveTerminalAccessoryLayout(getDefaultTerminalAccessoryLayout())).rejects.toThrow(
      'storage failed'
    )
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      TERMINAL_ACCESSORY_LAYOUT_STORAGE_KEY,
      expect.any(String)
    )
  })
})
