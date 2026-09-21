// @vitest-environment happy-dom
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LinkActionPopover } from './LinkActionPopover'
import type { LinkActionRequest } from './link-action-request'

const mocks = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn(), copy: vi.fn() }))
vi.mock('@/components/native-chat/link-preview/NativeChatLinkPreviewCard', () => ({
  NativeChatLinkPreviewCard: ({ expanded }: { expanded: boolean }) => {
    useEffect(() => {
      mocks.mount()
      return mocks.unmount
    }, [])
    return <div role="status">{expanded ? 'Expanded content' : 'Loading preview…'}</div>
  }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function request(): LinkActionRequest {
  return {
    anchorX: 30,
    anchorY: 50,
    destination: '/repo/src/main.ts',
    kind: 'file',
    transient: true,
    primary: { label: 'Open file', run: vi.fn() },
    alternate: { label: 'Open with default app', run: vi.fn() },
    restoreFocus: vi.fn(),
    preview: {
      target: {
        href: 'src/main.ts:42',
        key: '/repo/src/main.ts',
        path: '/repo/src/main.ts',
        line: 42,
        kind: 'file'
      }
    }
  }
}

describe('unified link preview', () => {
  it('focuses the primary action when first opened from the keyboard', async () => {
    render(
      <TooltipProvider>
        <LinkActionPopover
          request={{ ...request(), transient: false, focusOnOpen: true }}
          onClose={vi.fn()}
        />
      </TooltipProvider>
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Open file/ }))
    )
  })
  it('keeps loading content mounted when the hover is pinned and expanded', async () => {
    const current = request(),
      close = vi.fn(),
      pin = vi.fn()
    const view = render(
      <TooltipProvider>
        <LinkActionPopover request={current} onClose={close} onPin={pin} />
      </TooltipProvider>
    )
    await screen.findByRole('button', { name: 'Pin preview' })
    expect(mocks.mount).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Pin preview' }))
    expect(pin).toHaveBeenCalledWith(true)
    view.rerender(
      <TooltipProvider>
        <LinkActionPopover request={{ ...current, transient: false }} onClose={close} onPin={pin} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    expect(screen.getByText('Expanded content')).toBeTruthy()
    expect(mocks.mount).toHaveBeenCalledOnce()
    expect(mocks.unmount).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('offers opening and path copy even while content is loading', async () => {
    const current = request(),
      close = vi.fn()
    Object.assign(window, {
      api: { ui: { writeClipboardText: mocks.copy.mockResolvedValue(undefined) } }
    })
    render(
      <TooltipProvider>
        <LinkActionPopover request={current} onClose={close} />
      </TooltipProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Copy path' }))
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(current.destination))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Open file/ }))
    expect(close).toHaveBeenCalledWith(current)
    expect(current.primary.run).toHaveBeenCalledOnce()
    expect(current.restoreFocus).toHaveBeenCalledOnce()
  })

  it('does not take focus on hover and focuses the primary action on keyboard activation', async () => {
    const current = request()
    const view = render(
      <TooltipProvider>
        <button>Composer</button>
        <LinkActionPopover request={current} onClose={vi.fn()} />
      </TooltipProvider>
    )
    const composer = screen.getByRole('button', { name: 'Composer' })
    composer.focus()
    await screen.findByRole('button', { name: /Open file/ })
    expect(document.activeElement).toBe(composer)
    view.rerender(
      <TooltipProvider>
        <button>Composer</button>
        <LinkActionPopover
          request={{ ...current, transient: false, focusOnOpen: true }}
          onClose={vi.fn()}
        />
      </TooltipProvider>
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Open file/ }))
    )
  })
})
