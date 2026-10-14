// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { measureClaudeModsSite } from './claude-mods-layout-measure'
import { ClaudeModsLayoutRegistry } from './claude-mods-layout-registry'
import { EMPTY_CLAUDE_MODS_PANE_ROSTER } from '../../../../../shared/claude-mods-surface'

const ROW = 14
const CELL = 6

function rect(top: number, height: number, width = 100): DOMRect {
  return new DOMRect(0, top, width, height)
}

function measurable(container: HTMLElement, sizes: Record<string, number>): void {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(container, name, { value, configurable: true, writable: true })
  }
}

// Ten-pixel text puts a row at 14px and a column at 6px; the container is scrolled two rows.
function site(): {
  container: HTMLElement
  add: (attrs: Record<string, string>, r: DOMRect) => void
} {
  const container = document.createElement('div')
  container.style.fontSize = '10px'
  container.style.paddingLeft = '6px'
  container.style.paddingRight = '6px'
  container.getBoundingClientRect = () => rect(100, 70, 252)
  measurable(container, {
    clientHeight: 5 * ROW,
    clientWidth: 42 * CELL,
    scrollHeight: 20 * ROW,
    scrollTop: 2 * ROW,
    clientTop: 0
  })
  document.body.append(container)
  const add = (attrs: Record<string, string>, r: DOMRect): void => {
    const element = document.createElement('div')
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value)
    }
    element.getBoundingClientRect = () => r
    container.append(element)
  }
  return { container, add }
}

// An element at content row N sits at 100 - scrollTop + N * ROW in the viewport.
const atRow = (row: number): number => 100 - 2 * ROW + row * ROW

describe('measureClaudeModsSite', () => {
  it('counts the window and the content in rows of the site cell', () => {
    const { container } = site()
    expect(measureClaudeModsSite(container)).toEqual({
      offset: 2,
      bodyRows: 5,
      bodyColumns: 40,
      contentRows: 20,
      keyed: []
    })
  })

  it('lists keyed boxes and controls from the content top, bottom exclusive, in document order', () => {
    const { container, add } = site()
    add(
      { 'data-claude-mods-key': 'card', 'data-claude-mods-owner': 'notes' },
      rect(atRow(3), 2 * ROW)
    )
    add(
      {
        'data-claude-mods-key': 'save',
        'data-claude-mods-owner': 'notes',
        'data-claude-mods-control': ''
      },
      rect(atRow(10), ROW)
    )
    add({ 'data-claude-mods-key': 'unowned' }, rect(atRow(1), ROW))
    expect(measureClaudeModsSite(container).keyed).toEqual([
      { plugin: 'notes', key: 'card', top: 3, bottom: 5 },
      { plugin: 'notes', key: 'save', top: 10, bottom: 11 }
    ])
  })

  it('floors a keyed top so a start scroll shows the element whole', () => {
    const { container, add } = site()
    add(
      { 'data-claude-mods-key': 'card', 'data-claude-mods-owner': 'notes' },
      rect(atRow(3) + 0.6 * ROW, ROW)
    )
    expect(measureClaudeModsSite(container).keyed).toEqual([
      { plugin: 'notes', key: 'card', top: 3, bottom: 5 }
    ])
  })

  it('ends the engine window on the row the DOM can really scroll to', () => {
    const { container } = site()
    // 25.5 rows of window, 51 rows of content: the DOM bottom is scrollTop 25.5 rows, row 26.
    measurable(container, { clientHeight: 25.5 * ROW, scrollHeight: 51 * ROW })
    const layout = measureClaudeModsSite(container)
    expect(layout.bodyRows).toBe(25)
    expect(layout.contentRows - layout.bodyRows).toBe(26)
    measurable(container, { scrollTop: 25.5 * ROW })
    expect(measureClaudeModsSite(container).offset).toBe(layout.contentRows - layout.bodyRows)
  })

  it('leaves out hidden elements and names the wire would refuse', () => {
    const { container, add } = site()
    add({ 'data-claude-mods-key': 'gone', 'data-claude-mods-owner': 'notes' }, rect(0, 0, 0))
    add(
      { 'data-claude-mods-key': 'k'.repeat(257), 'data-claude-mods-owner': 'notes' },
      rect(atRow(2), ROW)
    )
    expect(measureClaudeModsSite(container).keyed).toEqual([])
  })

  it('stops at the 512 the wire accepts', () => {
    const { container, add } = site()
    for (let index = 0; index < 600; index++) {
      add(
        { 'data-claude-mods-key': `k${index}`, 'data-claude-mods-owner': 'notes' },
        rect(atRow(index), ROW)
      )
    }
    expect(measureClaudeModsSite(container).keyed).toHaveLength(512)
  })
})

describe('ClaudeModsLayoutRegistry', () => {
  const roster = {
    ...EMPTY_CLAUDE_MODS_PANE_ROSTER,
    panes: [{ id: 'notes', title: 'Notes' }],
    focused_id: 'notes'
  }

  it('sends a pane the props the terminal would, with the last drawing layout', () => {
    const registry = new ClaudeModsLayoutRegistry()
    registry.setViewport('Pane', { columns: 50, rows: 30 })
    registry.register('notes', () => ({
      offset: 2,
      bodyRows: 5,
      bodyColumns: 40,
      contentRows: 20,
      keyed: [{ plugin: 'notes', key: 'card', top: 3, bottom: 5 }],
      placement: 'inline'
    }))
    expect(registry.renderFields('Pane', 'notes', roster)).toEqual({
      props: {
        title: 'Notes',
        isFocused: true,
        bodyColumns: 40,
        placement: 'inline',
        scroll: { offset: 2, bodyRows: 5 },
        view: {}
      },
      viewport: { columns: 50, rows: 30 },
      content_rows: 20,
      keyed: [{ plugin: 'notes', key: 'card', top: 3, bottom: 5 }]
    })
  })

  it('sends the band its own props and leaves the layout out before the first drawing', () => {
    const registry = new ClaudeModsLayoutRegistry()
    const fields = registry.renderFields('AbovePrompt', 'above-prompt', roster)
    expect(fields).toEqual({
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 8,
        bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 0 },
        view: {}
      }
    })
  })

  it('forgets a site that unmounted, and reports a viewport change only after the first', () => {
    const registry = new ClaudeModsLayoutRegistry()
    const forget = registry.register('notes', () => null)
    forget()
    expect(registry.setViewport('Pane', { columns: 50, rows: 30 })).toBe(false)
    expect(registry.setViewport('Pane', { columns: 50, rows: 30 })).toBe(false)
    expect(registry.setViewport('Pane', { columns: 60, rows: 30 })).toBe(true)
  })
})
