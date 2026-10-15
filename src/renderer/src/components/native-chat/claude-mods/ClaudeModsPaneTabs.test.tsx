// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../ui/tooltip'
import { ClaudeModsPaneTabs } from './ClaudeModsPaneTabs'
import { claudeModsDrawsAnything } from './ClaudeModsPaneBody'
import { claudeModsPaneWidth } from './use-claude-mods-pane-width'
import { readClaudeModsTree } from './claude-mods-tree'

const GUIDE = { id: 'guide', title: 'Mods demo', plugin: 'mods-demo' }
const BLAST = { id: 'blast', title: 'Blast radius', plugin: 'blast-radius' }

function tabs(panes: (typeof GUIDE)[], attentionId: string | null = null) {
  const onShow = vi.fn()
  const onClose = vi.fn()
  render(
    <TooltipProvider>
      <ClaudeModsPaneTabs
        panes={panes}
        shownId="guide"
        attentionId={attentionId}
        onShow={onShow}
        onClose={onClose}
      />
    </TooltipProvider>
  )
  return { onShow, onClose }
}

afterEach(cleanup)

describe('ClaudeModsPaneTabs', () => {
  it('draws one pane as a title and a close button, with no tab strip', () => {
    const { onClose } = tabs([GUIDE])
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText('Mods demo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close pane' }))
    expect(onClose).toHaveBeenCalledWith('guide')
  })

  it('draws several panes as tabs that show, close on middle-click and on Delete', () => {
    const { onShow, onClose } = tabs([GUIDE, BLAST])
    const [guide, blast] = screen.getAllByRole('tab')
    expect(guide?.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(blast!)
    expect(onShow).toHaveBeenCalledWith('blast')
    fireEvent(blast!, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    fireEvent.keyDown(guide!, { key: 'Delete' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Blast radius' }))
    expect(onClose.mock.calls).toEqual([['blast'], ['guide'], ['blast']])
  })

  it('marks a pane that waits for the person', () => {
    tabs([GUIDE, BLAST], 'blast')
    expect(screen.getByRole('img', { name: 'Waiting for you' })).toBeTruthy()
  })
})

describe('claudeModsDrawsAnything', () => {
  it('tells an empty drawing from one that puts something on screen', () => {
    expect(claudeModsDrawsAnything(readClaudeModsTree({ type: 'Box', children: [' '] }))).toBe(
      false
    )
    expect(claudeModsDrawsAnything(readClaudeModsTree({ type: 'Box', children: ['hi'] }))).toBe(
      true
    )
    expect(
      claudeModsDrawsAnything(readClaudeModsTree({ type: 'Box', props: { borderStyle: 'round' } }))
    ).toBe(true)
  })
})

describe('claudeModsPaneWidth', () => {
  it('starts at a third of the row, at least 280px, and leaves the chat room', () => {
    expect(claudeModsPaneWidth(1200, null)).toBe(400)
    expect(claudeModsPaneWidth(720, null)).toBe(280)
    expect(claudeModsPaneWidth(1200, 1100)).toBe(880)
  })
})
