// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { NativeChatPreviewLink } from './NativeChatPreviewLink'

vi.mock('@/components/link-actions/LinkActionPopover', () => ({
  LinkActionPopover: ({
    request,
    onPointerEnter,
    onPointerLeave,
    onPin
  }: {
    request: LinkActionRequest | null
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    onPin?: (pinned: boolean) => void
  }) =>
    request ? (
      <div
        data-testid="preview-popover"
        data-transient={String(request.transient)}
        data-focus-on-open={String(request.focusOnOpen)}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {request.preview?.target.path}
        <button type="button" onClick={() => onPin?.(request.transient === true)}>
          pin
        </button>
      </div>
    ) : null
}))

const context: RuntimeFileOperationArgs = {
  settings: null,
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

function linkHandler(pinOnClick = true): CommentMarkdownLinkClickHandler {
  const handler = vi.fn() as unknown as CommentMarkdownLinkClickHandler
  let active: { owner: symbol; close: () => void; pinned: boolean } | null = null
  handler.createPreviewRequest = vi.fn((anchor) => requestFor(anchor, pinOnClick))
  handler.claimPreview = (owner, close, pinned) => {
    if (active?.owner === owner) {
      active = { owner, close, pinned }
      return true
    }
    if (active?.pinned && !pinned) {
      return false
    }
    active?.close()
    active = { owner, close, pinned }
    return true
  }
  handler.releasePreview = (owner) => {
    if (active?.owner === owner) {
      active = null
    }
  }
  return handler
}

function Preview({
  onLinkClick,
  hover = true,
  href = 'src/main.ts#L12',
  children = 'main'
}: {
  onLinkClick?: CommentMarkdownLinkClickHandler
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
  it('opens after 250ms and crosses the pointer gap during the 150ms close delay', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(249))
    expect(screen.queryByTestId('preview-popover')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    const popover = screen.getByTestId('preview-popover')
    expect(popover.dataset.transient).toBe('true')

    fireEvent.pointerLeave(link)
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerEnter(popover)
    act(() => vi.advanceTimersByTime(100))
    expect(screen.getByTestId('preview-popover')).toBeTruthy()

    fireEvent.pointerLeave(popover)
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByTestId('preview-popover')).toBeNull()
  })

  it('pins the mounted hover request on click without rebuilding it', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })
    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(250))

    expect(fireEvent.click(link, { detail: 1 })).toBe(false)

    expect(screen.getByTestId('preview-popover').dataset.transient).toBe('false')
    expect(handler.createPreviewRequest).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns an unpinned card to transient close behavior without removing it immediately', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })
    fireEvent.pointerEnter(link)
    act(() => vi.advanceTimersByTime(250))
    fireEvent.click(link, { detail: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'pin' }))

    const popover = screen.getByTestId('preview-popover')
    expect(popover.dataset.transient).toBe('true')
    fireEvent.pointerLeave(popover)
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByTestId('preview-popover')).toBeNull()
  })

  it('keeps a pinned preview through another hover and replaces it on explicit click', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(
      <>
        <Preview onLinkClick={handler}>first</Preview>
        <Preview onLinkClick={handler} href="docs/guide.md">
          second
        </Preview>
      </>
    )
    const first = screen.getByRole('link', { name: 'first' })
    const second = screen.getByRole('link', { name: 'second' })
    fireEvent.pointerEnter(first)
    act(() => vi.advanceTimersByTime(250))
    fireEvent.click(first, { detail: 1 })
    fireEvent.pointerEnter(second)
    act(() => vi.advanceTimersByTime(250))

    expect(screen.getAllByTestId('preview-popover')).toHaveLength(1)
    expect(screen.getByTestId('preview-popover').textContent).toContain('src/main.ts')

    fireEvent.click(second, { detail: 1 })

    expect(screen.getAllByTestId('preview-popover')).toHaveLength(1)
    expect(screen.getByTestId('preview-popover').textContent).toContain('docs/guide.md')
  })

  it('focuses actions when keyboard activation pins the focused preview', () => {
    vi.useFakeTimers()
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })
    fireEvent.focus(link)
    act(() => vi.advanceTimersByTime(250))

    fireEvent.click(link, { detail: 0 })

    expect(screen.getByTestId('preview-popover').dataset.focusOnOpen).toBe('true')
  })

  it('keeps direct modifier clicks on the existing file opener', () => {
    const handler = linkHandler()
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    expect(fireEvent.click(link, { metaKey: true })).toBe(false)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.createPreviewRequest).not.toHaveBeenCalled()
    expect(screen.queryByTestId('preview-popover')).toBeNull()
  })

  it('delegates plain clicks when destination actions are disabled', () => {
    const handler = linkHandler(false)
    render(<Preview onLinkClick={handler} />)
    const link = screen.getByRole('link', { name: 'main' })

    expect(fireEvent.click(link)).toBe(false)

    expect(handler).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('preview-popover')).toBeNull()
  })

  it('delegates plain clicks when no preview request can be built', () => {
    const handler = linkHandler()
    handler.createPreviewRequest = vi.fn(() => null)
    render(<Preview onLinkClick={handler} />)

    fireEvent.click(screen.getByRole('link', { name: 'main' }))

    expect(handler).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('preview-popover')).toBeNull()
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
