import { describe, expect, it } from 'vitest'
import { layoutClaudeModsBand } from './claude-mods-band-layout'
import { readClaudeModsTree } from './claude-mods-tree'

const dismiss = {
  type: 'Button',
  props: { key: 'x', label: 'Close', role: 'dismiss' },
  press: { plugin: 'p', handle: 1 }
}

describe('layoutClaudeModsBand', () => {
  it('lifts dismiss Buttons out of the tree', () => {
    const layout = layoutClaudeModsBand(
      readClaudeModsTree({ type: 'Box', children: [{ type: 'Text', children: ['Hi'] }, dismiss] })
    )
    expect(layout.dismiss).toHaveLength(1)
    expect(layout.dismiss[0]?.props.label).toBe('Close')
    expect(JSON.stringify(layout.tree)).not.toContain('dismiss')
    expect(layout.visible).toBe(true)
  })

  it('is not visible when only a dismiss Button or blank text is left', () => {
    expect(layoutClaudeModsBand(readClaudeModsTree(dismiss)).visible).toBe(false)
    expect(
      layoutClaudeModsBand(
        readClaudeModsTree({ type: 'Box', children: [{ type: 'Text', children: ['  '] }, dismiss] })
      ).visible
    ).toBe(false)
    expect(layoutClaudeModsBand(readClaudeModsTree({ type: 'Box', children: [] })).visible).toBe(
      false
    )
  })

  it('counts controls, graphics, markdown text and painted Boxes as visible', () => {
    const visible = (tree: unknown): boolean =>
      layoutClaudeModsBand(readClaudeModsTree(tree)).visible
    expect(visible({ type: 'Box', children: [{ type: 'Button', props: { label: 'Go' } }] })).toBe(
      true
    )
    expect(visible({ type: 'Markdown', props: { text: 'x' } })).toBe(true)
    expect(visible({ type: 'Markdown', props: { text: ' ' } })).toBe(false)
    expect(visible({ type: 'Box', props: { backgroundColor: 'red' } })).toBe(true)
    expect(visible({ type: 'Box', props: { paddingX: 1 } })).toBe(false)
  })

  it('drops the root vertical margins and keeps the horizontal ones', () => {
    const layout = layoutClaudeModsBand(
      readClaudeModsTree({
        type: 'Box',
        props: { margin: 1, marginTop: 2, marginBottom: 2, marginY: 1, gap: 1 },
        children: ['Hi']
      })
    )
    expect(layout.tree).toMatchObject({ props: { marginX: 1, gap: 1 } })
    const props = layout.tree.kind === 'element' ? layout.tree.props : {}
    expect(props).not.toHaveProperty('marginTop')
    expect(props).not.toHaveProperty('margin')
    expect(props).not.toHaveProperty('marginY')
  })
})
