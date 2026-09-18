// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { NativeChatPreviewLink } from './NativeChatPreviewLink'

const context: RuntimeFileOperationArgs = {
  settings: null,
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

afterEach(cleanup)

describe('native chat preview links', () => {
  it('routes file clicks through the chat handler without navigating the anchor', () => {
    const onLinkClick = vi.fn()
    render(
      <NativeChatPreviewLink
        href="src/main.ts#L12"
        hover={false}
        runtimeContext={context}
        onLinkClick={onLinkClick}
      >
        main
      </NativeChatPreviewLink>
    )
    const link = screen.getByRole('link', { name: 'main' })
    expect(fireEvent.click(link)).toBe(false)
    expect(onLinkClick).toHaveBeenCalledOnce()
    expect(onLinkClick.mock.calls[0]?.[1]).toBe('src/main.ts#L12')
  })

  it('keeps the destination on web links', () => {
    render(
      <NativeChatPreviewLink
        href="https://example.com/guide"
        hover={false}
        runtimeContext={context}
      >
        guide
      </NativeChatPreviewLink>
    )
    expect(screen.getByRole('link', { name: 'guide' }).getAttribute('href')).toBe(
      'https://example.com/guide'
    )
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
