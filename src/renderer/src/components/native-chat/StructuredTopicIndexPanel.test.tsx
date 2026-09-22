// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredTopicIndex } from '../../../../shared/structured-topic-index'
import { StructuredTopicIndexPanel } from './StructuredTopicIndexPanel'

afterEach(cleanup)

const index: StructuredTopicIndex = {
  sessionId: 'session',
  revision: 4,
  automatic: true,
  chapters: [
    {
      id: 'first',
      title: 'Login recovery',
      titleSource: 'manual',
      boundaryAfterManual: true,
      start: { epoch: 'epoch', itemId: 'user-1', sequence: 1 },
      end: { epoch: 'epoch', itemId: 'assistant-2', sequence: 2 }
    },
    {
      id: 'second',
      title: 'Database migration',
      titleSource: 'automatic',
      boundaryAfterManual: false,
      start: { epoch: 'epoch', itemId: 'user-3', sequence: 3 },
      end: { epoch: 'epoch', itemId: 'assistant-4', sequence: 4 }
    }
  ]
}

const items = [
  {
    itemId: 'user-1',
    sequence: 1,
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Fix login timeout' }] }
  },
  {
    itemId: 'assistant-2',
    sequence: 2,
    body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Done' }] }
  },
  {
    itemId: 'user-3',
    sequence: 3,
    body: {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'Plan database migration' }]
    }
  },
  {
    itemId: 'assistant-4',
    sequence: 4,
    body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Plan' }] }
  }
] as AgentJournalRenderItem[]

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof StructuredTopicIndexPanel>> = {}
) {
  const onNavigate = vi.fn()
  const onSave = vi.fn()
  const onLoadOlder = vi.fn()
  render(
    <StructuredTopicIndexPanel
      index={index}
      items={items}
      epoch="epoch"
      onNavigate={onNavigate}
      onSave={onSave}
      onLoadOlder={onLoadOlder}
      {...overrides}
    />
  )
  return { onNavigate, onSave, onLoadOlder }
}

describe('StructuredTopicIndexPanel', () => {
  it('keeps automatic indexing user-controllable before a chapter exists', () => {
    const { onSave } = renderPanel({ index: { ...index, chapters: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ automatic: false, revision: 5 }))
  })

  it('navigates using the durable journal anchor', () => {
    const { onNavigate } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
    fireEvent.click(screen.getByRole('button', { name: /Login recovery/ }))
    expect(onNavigate).toHaveBeenCalledWith(index.chapters[0]!.start)
  })

  it('does not navigate an anchor from an earlier journal epoch', () => {
    const { onNavigate } = renderPanel({ epoch: 'new-epoch' })
    fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
    fireEvent.click(screen.getByRole('button', { name: /Login recovery/ }))
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('This topic belongs to an earlier conversation history.')).toBeVisible()
  })

  it('persists rename and merge edits', () => {
    const { onSave } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename topic' })[0]!)
    fireEvent.change(screen.getByDisplayValue('Login recovery'), {
      target: { value: 'Auth fixes' }
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chapters: expect.arrayContaining([expect.objectContaining({ title: 'Auth fixes' })])
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Merge topics' }))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chapters: [expect.objectContaining({ end: index.chapters[1]!.end })]
      })
    )
  })

  it('splits at the selected exact user-turn anchor', () => {
    const splitIndex: StructuredTopicIndex = {
      ...index,
      chapters: [{ ...index.chapters[0]!, end: index.chapters[1]!.end }]
    }
    const { onSave, onLoadOlder } = renderPanel({ index: splitIndex })
    fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier turns' }))
    expect(onLoadOlder).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('combobox', { name: 'Split at user turn' }), {
      target: { value: 'user-3' }
    })
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chapters: expect.arrayContaining([
          expect.objectContaining({
            start: expect.objectContaining({ itemId: 'user-3', sequence: 3 })
          })
        ])
      })
    )
  })
})
