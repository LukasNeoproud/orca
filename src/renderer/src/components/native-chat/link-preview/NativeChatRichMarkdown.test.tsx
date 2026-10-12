// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { CommentMarkdownLinkPreviewHooks } from '@/components/sidebar/comment-markdown-element-renderers'

type PreviewLinkHandler = CommentMarkdownLinkClickHandler & CommentMarkdownLinkPreviewHooks
import { TooltipProvider } from '@/components/ui/tooltip'
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
        fileLinkExists={() => true}
        content="See src/main.ts:12 and `/repo/worktree/docs/guide.md:7`."
      />
    )
    expect(screen.getAllByTestId('preview-card').map((card) => card.textContent)).toEqual([
      '/repo/worktree/src/main.ts',
      '/repo/worktree/docs/guide.md'
    ])
  })

  it('delegates keyboard-activated hover previews to the transcript', async () => {
    mocks.mode = 'hover'
    const onLinkClick = vi.fn() as unknown as PreviewLinkHandler
    onLinkClick.showPreview = vi.fn()
    onLinkClick.createPreviewRequest = (anchor) => ({
      anchorX: 0,
      anchorY: 0,
      anchorElement: anchor,
      destination: '/repo/worktree/src/main.ts',
      kind: 'file',
      primary: { label: 'Open file', run: vi.fn() },
      restoreFocus: vi.fn()
    })
    render(
      <TooltipProvider>
        <NativeChatRichMarkdown
          runtimeContext={context}
          content="Open [main](src/main.ts)."
          onLinkClick={onLinkClick}
        />
      </TooltipProvider>
    )
    expect(screen.queryByTestId('preview-card')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'main' }), { detail: 0 })
    expect(onLinkClick.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ transient: false, focusOnOpen: true }),
      true
    )
  })

  it('does not create previews for paths inside a fenced code block', () => {
    mocks.mode = 'paragraph'
    render(
      <NativeChatRichMarkdown runtimeContext={context} content={'```ts\nsrc/main.ts:3\n```'} />
    )
    expect(screen.queryByTestId('preview-card')).toBeNull()
  })
})
