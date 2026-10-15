import { describe, expect, it } from 'vitest'
import { readClaudeModsTree } from '../claude-mods-tree'
import { claudeModsHandlesByKey } from './claude-mods-client-instance'

describe('claudeModsHandlesByKey', () => {
  it('maps each keyed control of a drawing to its current handle', () => {
    const tree = readClaudeModsTree({
      type: 'Box',
      children: [
        {
          type: 'Button',
          props: { key: 'count', label: 'Count 0' },
          press: { plugin: 'p', handle: 7 }
        },
        { type: 'Input', props: { key: 'name' }, press: { plugin: 'p', handle: 8 } },
        { type: 'Text', children: ['no press'] }
      ]
    })
    expect([...claudeModsHandlesByKey(tree)]).toEqual([
      ['count', 7],
      ['name', 8]
    ])
  })
})
