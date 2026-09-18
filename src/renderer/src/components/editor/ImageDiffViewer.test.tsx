// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addDiffComment: vi.fn(),
  deleteDiffComment: vi.fn(),
  updateDiffComment: vi.fn(),
  setScrollToDiffCommentId: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      addDiffComment: mocks.addDiffComment,
      deleteDiffComment: mocks.deleteDiffComment,
      updateDiffComment: mocks.updateDiffComment,
      scrollToDiffCommentId: null,
      setScrollToDiffCommentId: mocks.setScrollToDiffCommentId
    })
}))
vi.mock('@/store/worktree-diff-comments-selector', () => ({ selectWorktreeDiffComments: () => [] }))
vi.mock('./ImageDiffPane', () => ({
  ImageDiffPane: ({ label }: { label: string }) => <div>{label}</div>
}))
vi.mock('./ImageViewer', () => ({ default: () => <div>PDF</div> }))

import ImageDiffViewer from './ImageDiffViewer'

afterEach(cleanup)
beforeEach(() => {
  mocks.addDiffComment.mockReset().mockResolvedValue({ id: 'saved' })
})

describe('ImageDiffViewer review notes', () => {
  it('offers a keyboard route to a bounded image area and saves it in the review-note store', async () => {
    render(
      <ImageDiffViewer
        originalContent="AAAA"
        modifiedContent="BBBB"
        filePath="screenshots/panel.png"
        worktreeId="worktree"
        sideBySide
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enter area coordinates' }))
    fireEvent.change(screen.getByLabelText('x (%)'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('width (%)'), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Image area note' }), {
      target: { value: 'Move this control' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    await waitFor(() =>
      expect(mocks.addDiffComment).toHaveBeenCalledWith({
        worktreeId: 'worktree',
        filePath: 'screenshots/panel.png',
        source: 'image',
        imageRegion: { x: 25, y: 0, width: 50, height: 100 },
        lineNumber: 0,
        body: 'Move this control',
        side: 'modified'
      })
    )
  })
})
