// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { nativeChatFilePreviewActions } from './native-chat-file-preview-actions'

const mocks = vi.hoisted(() => ({
  openDiff: vi.fn(),
  entries: [] as { path: string; area: string }[]
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ gitStatusByWorktree: { remote: mocks.entries }, openDiff: mocks.openDiff })
  }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const context = {
  worktreeId: 'remote',
  worktreePath: '/remote/repo',
  runtimeEnvironmentId: 'server'
}
const event = {
  currentTarget: document.createElement('a'),
  detail: 0,
  clientX: 0,
  clientY: 0
} as unknown as Parameters<CommentMarkdownLinkClickHandler>[0]

describe('native chat file actions', () => {
  it('adds a quoted reference to the draft without opening or submitting anything', () => {
    const insert = vi.fn()
    const open = vi.fn()
    const request = nativeChatFilePreviewActions(
      event,
      'file:///remote/repo/my%20file.ts#L8',
      context,
      open,
      insert
    )
    request?.additionalActions?.find((action) => action.label === 'Add reference to prompt')?.run()
    expect(insert).toHaveBeenCalledWith('@"/remote/repo/my file.ts:8" ')
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the matching staged diff in the owning workspace', () => {
    mocks.entries = [{ path: 'src/main.ts', area: 'staged' }]
    const request = nativeChatFilePreviewActions(event, 'src/main.ts', context, vi.fn())
    request?.additionalActions
      ?.find((action) => action.label === 'Review changes in Source Control')
      ?.run()
    expect(mocks.openDiff).toHaveBeenCalledWith(
      'remote',
      '/remote/repo/src/main.ts',
      'src/main.ts',
      'typescript',
      true
    )
    mocks.entries = []
  })

  it('keeps file opening available without Git status', () => {
    const open = vi.fn()
    const request = nativeChatFilePreviewActions(event, 'readme.md', context, open)
    expect(
      request?.additionalActions?.some((action) => action.label.includes('Source Control'))
    ).toBe(false)
    request?.primary.run()
    expect(open).toHaveBeenCalledWith(event, 'readme.md')
  })
})
