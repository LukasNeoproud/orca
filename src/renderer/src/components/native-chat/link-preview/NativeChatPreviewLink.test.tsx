// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { CommentMarkdownLinkPreviewHooks } from '@/components/sidebar/comment-markdown-element-renderers'

type PreviewLinkHandler = CommentMarkdownLinkClickHandler & CommentMarkdownLinkPreviewHooks
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { NativeChatPreviewLink } from './NativeChatPreviewLink'

const context: RuntimeFileOperationArgs = {
  target: { kind: 'local' },
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

function requestFor(anchor: HTMLElement, pinOnClick = true): LinkActionRequest {
  const bounds = anchor.getBoundingClientRect()
  return {
    anchorX: bounds.left,
    anchorY: bounds.bottom,
    anchorElement: anchor,
    destination: '/repo/worktree/src/main.ts',
    kind: 'file',
    primary: { label: 'Open file', run: vi.fn() },
    restoreFocus: vi.fn(),
    pinOnClick
  }
}

function linkHandler(pinOnClick = true): PreviewLinkHandler {
  const handler = vi.fn() as unknown as PreviewLinkHandler
  handler.createPreviewRequest = vi.fn((anchor) => requestFor(anchor, pinOnClick))
  handler.showPreview = vi.fn()
  return handler
}

function Preview({
  onLinkClick,
  hover = true,
  href = 'src/main.ts#L12',
  children = 'main'
}: {
  onLinkClick?: PreviewLinkHandler
  hover?: boolean
  href?: string
  children?: ReactNode
}) {
  return (
    <NativeChatPreviewLink
      href={href}
      hover={hover}
      runtimeContext={context}
      onLinkClick={onLinkClick}
    >
      {children}
    </NativeChatPreviewLink>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('native chat preview links', () => {
  it('forwards a hover request after 250ms and only cancels it while pending', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(249))
    expect(handler.showPreview).not.toHaveBeenCalled()

    fireEvent.pointerLeave(link)
    act(() => vi.advanceTimersByTime(1_000))
    expect(handler.showPreview).not.toHaveBeenCalled()

    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(250))
    expect(handler.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorElement: link,
        destination: '/repo/worktree/src/main.ts',
        focusOnOpen: false,
        transient: false,
        preview: expect.objectContaining({
          target: expect.objectContaining({ path: '/repo/worktree/src/main.ts', line: 12 })
        })
      }),
      false
    )

    fireEvent.pointerLeave(link)
    act(() => vi.advanceTimersByTime(1_000))
    expect(handler.showPreview).toHaveBeenCalledOnce()
  })

  it('delegates a click as an explicit preview request after a hover preview', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(250))
    expect(fireEvent.click(link, { detail: 1 })).toBe(false)

    expect(handler.createPreviewRequest).toHaveBeenCalledTimes(2)
    expect(handler.showPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ focusOnOpen: false, transient: false }),
      true
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('requests focus when keyboard activation opens a preview', () => {
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    expect(fireEvent.click(link, { detail: 0 })).toBe(false)

    expect(handler.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ focusOnOpen: true, transient: false }),
      true
    )
  })

  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }])(
    'keeps modifier clicks on the existing file opener: %o',
    (modifiers) => {
      const handler = linkHandler()
      render(<Preview onLinkClick={handler} />)

      expect(fireEvent.click(screen.getByRole('link', { name: 'main' }), modifiers)).toBe(false)

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.createPreviewRequest).not.toHaveBeenCalled()
      expect(handler.showPreview).not.toHaveBeenCalled()
    }
  )

  it('keeps hover previews available but delegates explicit clicks when destination actions are disabled', () => {
    vi.useFakeTimers()
    const handler = linkHandler(false)
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(250))
    expect(handler.showPreview).toHaveBeenCalledWith(expect.anything(), false)

    expect(fireEvent.click(link)).toBe(false)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.showPreview).toHaveBeenCalledOnce()
  })

  it('delegates plain clicks when no preview request can be built', () => {
    const handler = linkHandler()
    handler.createPreviewRequest = vi.fn(() => null)
    render(<Preview onLinkClick={handler} />)

    fireEvent.click(screen.getByRole('link', { name: 'main' }))

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.showPreview).not.toHaveBeenCalled()
  })

  it('adds preview context to the legacy click request when hover is off', () => {
    const handler = linkHandler()
    render(<Preview hover={false} onLinkClick={handler} />)

    fireEvent.click(screen.getByRole('link', { name: 'main' }))

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      'src/main.ts#L12',
      expect.objectContaining({
        preview: expect.objectContaining({
          target: expect.objectContaining({ path: '/repo/worktree/src/main.ts', line: 12 }),
          runtimeContext: context
        })
      })
    )
    expect(handler.createPreviewRequest).not.toHaveBeenCalled()
    expect(handler.showPreview).not.toHaveBeenCalled()
  })

  it('prevents file URI navigation when runtime context is missing', () => {
    render(
      <NativeChatPreviewLink href="file:///tmp/example.ts#L3" hover runtimeContext={null}>
        example
      </NativeChatPreviewLink>
    )
    const link = screen.getByRole('link', { name: 'example' })
    expect(fireEvent.click(link)).toBe(false)
    expect(
      link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    ).toBe(false)
  })
})
