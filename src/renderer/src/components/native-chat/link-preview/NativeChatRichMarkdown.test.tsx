// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { NativeChatRichMarkdown } from './NativeChatRichMarkdown'

const mocks = vi.hoisted(() => ({ mode: 'hover' as 'hover' | 'paragraph' }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { nativeChatLinkPreviewMode: mocks.mode } })
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./NativeChatLinkPreviewCard', () => ({
  NativeChatLinkPreviewCard: ({ target }: { target: { path: string } }) => (
    <div data-testid="preview-card">{target.path}</div>
  )
}))

const context: RuntimeFileOperationArgs = {
  settings: null,
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

afterEach(() => {
  cleanup()
  mocks.mode = 'hover'
})

describe('native chat rich markdown previews', () => {
  it('places one card after a paragraph and another after a list', () => {
    mocks.mode = 'paragraph'
    const { container } = render(
      <NativeChatRichMarkdown
        runtimeContext={context}
        content={'Open [main](src/main.ts).\n\n- [guide](docs/guide.md)\n- [main](src/main.ts)'}
      />
    )
    const cards = screen.getAllByTestId('preview-card')
    expect(cards.map((card) => card.textContent)).toEqual([
      '/repo/worktree/src/main.ts',
      '/repo/worktree/docs/guide.md'
    ])
    expect(container.querySelector('p')?.nextElementSibling).toBe(cards[0])
    expect(container.querySelector('ul')?.nextElementSibling).toBe(cards[1])
  })

  it('places a preview after a heading and deduplicates its later list link', () => {
    mocks.mode = 'paragraph'
    const { container } = render(
      <NativeChatRichMarkdown
        runtimeContext={context}
        content={
          '## [main](src/main.ts#L4)\n\n- [main again](src/main.ts#L12)\n- [guide](docs/guide.md)'
        }
      />
    )
    const cards = screen.getAllByTestId('preview-card')
    expect(cards.map((card) => card.textContent)).toEqual([
      '/repo/worktree/src/main.ts',
      '/repo/worktree/docs/guide.md'
    ])
    expect(container.querySelector('h2')?.nextElementSibling).toBe(cards[0])
    expect(container.querySelector('ul')?.nextElementSibling).toBe(cards[1])
  })

  it('groups generated links from prose and inline code in one paragraph', () => {
    mocks.mode = 'paragraph'
    render(
      <NativeChatRichMarkdown
        runtimeContext={context}
        linkifyFilePaths
        content="See src/main.ts:12 and `/repo/worktree/docs/guide.md:7`."
      />
    )
    expect(screen.getAllByTestId('preview-card').map((card) => card.textContent)).toEqual([
      '/repo/worktree/src/main.ts',
      '/repo/worktree/docs/guide.md'
    ])
  })

  it('keeps previews in hover mode until link focus', async () => {
    mocks.mode = 'hover'
    render(<NativeChatRichMarkdown runtimeContext={context} content="Open [main](src/main.ts)." />)
    expect(screen.queryByTestId('preview-card')).toBeNull()
    fireEvent.focus(screen.getByRole('link', { name: 'main' }))
    await waitFor(() => expect(screen.getByTestId('preview-card')).toBeTruthy())
  })

  it('does not create previews for paths inside a fenced code block', () => {
    mocks.mode = 'paragraph'
    render(
      <NativeChatRichMarkdown runtimeContext={context} content={'```ts\nsrc/main.ts:3\n```'} />
    )
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })

  it('highlights a fenced language after the lazy code renderer loads', async () => {
    render(<NativeChatRichMarkdown content={'```typescript\nconst answer = 42\n```'} />)
    await waitFor(() => expect(document.querySelector('.hljs-keyword')?.textContent).toBe('const'))
  })
})
