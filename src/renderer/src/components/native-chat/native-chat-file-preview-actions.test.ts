// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { nativeChatFilePreviewActions } from './native-chat-file-preview-actions'
import type * as TerminalFileOpenRouting from '@/components/terminal-pane/terminal-file-open-routing'
import type * as I18n from '@/i18n/i18n'

const mocks = vi.hoisted(() => ({
  openDiff: vi.fn(),
  openFile: vi.fn(),
  entries: [] as { path: string; area: string }[]
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ gitStatusByWorktree: { remote: mocks.entries }, openDiff: mocks.openDiff })
  }
}))
vi.mock('@/i18n/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18n>()),
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/components/terminal-pane/terminal-file-open-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof TerminalFileOpenRouting>()),
  openDetectedFilePath: mocks.openFile
}))
const context = {
  worktreeId: 'remote',
  worktreePath: '/remote/repo',
  runtimeEnvironmentId: 'server'
}
const anchor = document.createElement('a')

describe('native chat file actions', () => {
  it('adds a quoted reference to the draft without opening or submitting anything', () => {
    const insert = vi.fn()
    const request = nativeChatFilePreviewActions(
      anchor,
      'file:///remote/repo/my%20file.ts#L8',
      context,
      insert
    )
    request?.secondaryActions?.find((action) => action.label === 'Add reference to prompt')?.run()
    expect(insert).toHaveBeenCalledWith('@"/remote/repo/my file.ts:8" ')
    expect(mocks.openFile).not.toHaveBeenCalled()
  })

  it('opens the matching staged diff in the owning workspace', () => {
    mocks.entries = [{ path: 'src/main.ts', area: 'staged' }]
    const request = nativeChatFilePreviewActions(anchor, 'src/main.ts', context)
    request?.secondaryActions
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
    const request = nativeChatFilePreviewActions(anchor, 'readme.md', context)
    expect(
      request?.secondaryActions?.some((action) => action.label.includes('Source Control'))
    ).toBe(false)
    request?.primary.run()
    expect(mocks.openFile).toHaveBeenCalledWith(
      '/remote/repo/readme.md',
      null,
      null,
      expect.objectContaining({ worktreeId: 'remote' })
    )
    expect(request?.alternate?.label).toBe('Download & open with default app')
  })

  it('anchors hover actions to the real link without dispatching a click', () => {
    const click = vi.fn()
    anchor.addEventListener('click', click)
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      left: 12,
      bottom: 34
    } as DOMRect)

    const request = nativeChatFilePreviewActions(anchor, 'readme.md', context)

    expect(request).toMatchObject({ anchorX: 12, anchorY: 34, anchorElement: anchor })
    expect(click).not.toHaveBeenCalled()
  })
})
