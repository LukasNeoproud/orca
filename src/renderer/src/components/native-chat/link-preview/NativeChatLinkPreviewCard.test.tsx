// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { NativeChatLinkPreviewCard } from './NativeChatLinkPreviewCard'

const mocks = vi.hoisted(() => ({ usePreview: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./useNativeChatFilePreview', () => ({
  useNativeChatFilePreview: mocks.usePreview
}))

const context: RuntimeFileOperationArgs = {
  target: { kind: 'local' },
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

afterEach(() => {
  cleanup()
  mocks.usePreview.mockReset()
  vi.unstubAllGlobals()
})

describe('native chat link preview card', () => {
  it('renders a malformed web URL as plain text without crashing', () => {
    mocks.usePreview.mockReturnValue({ status: 'unavailable', changed: false, reload: vi.fn() })
    render(
      <NativeChatLinkPreviewCard
        target={{ href: 'https://%', key: 'https://%', path: 'https://%', kind: 'web', line: null }}
      />
    )
    expect(screen.getByText('https://%')).toBeTruthy()
  })

  it('waits for explicit Load preview before enabling an outside-workspace read', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
        observe(): void {
          this.callback([{ isIntersecting: true }])
        }
        disconnect(): void {}
      }
    )
    mocks.usePreview.mockReturnValue({ status: 'unavailable', changed: false, reload: vi.fn() })
    render(
      <NativeChatLinkPreviewCard
        target={{
          href: '/private/secrets/token.txt',
          key: '/private/secrets/token.txt',
          path: '/private/secrets/token.txt',
          kind: 'file',
          line: null
        }}
        runtimeContext={context}
      />
    )
    expect(screen.getByText('This file is outside the conversation’s workspace.')).toBeTruthy()
    expect(mocks.usePreview.mock.lastCall?.[2]).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Load preview' }))
    await waitFor(() => expect(mocks.usePreview.mock.lastCall?.[2]).toBe(true))
  })
})
