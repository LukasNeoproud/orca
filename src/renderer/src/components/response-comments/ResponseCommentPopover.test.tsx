// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResponseCommentPopover } from './ResponseCommentPopover'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const selection = {
  quote: 'const answer = 42',
  rect: { left: 20, top: 30, right: 100, bottom: 46, width: 80, height: 16 }
}

afterEach(() => cleanup())

describe('ResponseCommentPopover', () => {
  it('freezes editing synchronously and keeps text when save is rejected', async () => {
    const onEditingChange = vi.fn()
    const onSave = vi.fn(async () => false)
    render(
      <ResponseCommentPopover
        selection={selection}
        onSave={onSave}
        onDismiss={vi.fn()}
        onEditingChange={onEditingChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onEditingChange).toHaveBeenLastCalledWith(true)
    const editor = screen.getByRole('textbox', { name: 'Comment text' })
    fireEvent.change(editor, { target: { value: 'Explain this choice' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add comment' })))

    expect(onSave).toHaveBeenCalledWith('Explain this choice')
    expect((editor as HTMLTextAreaElement).value).toBe('Explain this choice')
    expect(screen.queryByText('Could not add comment. Try again.')).not.toBeNull()
  })

  it('dismisses after a successful save', async () => {
    const onDismiss = vi.fn()
    render(
      <ResponseCommentPopover selection={selection} onSave={() => true} onDismiss={onDismiss} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment text' }), {
      target: { value: 'Use a named constant' }
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add comment' })))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not submit the Enter used to confirm IME composition', async () => {
    const onSave = vi.fn(() => true)
    render(<ResponseCommentPopover selection={selection} onSave={onSave} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    const editor = screen.getByRole('textbox', { name: 'Comment text' })
    fireEvent.change(editor, { target: { value: '変数名を変更' } })
    fireEvent.keyDown(editor, {
      key: 'Enter',
      keyCode: 229,
      metaKey: true,
      isComposing: true
    })
    expect(onSave).not.toHaveBeenCalled()
  })
})
