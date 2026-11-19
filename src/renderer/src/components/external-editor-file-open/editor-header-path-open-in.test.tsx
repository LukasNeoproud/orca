// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorPanelHeaderPath } from '@/components/editor/EditorPanelHeaderPath'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'

vi.mock('@/store/selectors', () => ({
  useWorktreeById: () => ({ path: '/repo', repoId: 'repo-1' }),
  getWorktreeMapFromState: () => new Map([['repo-1::/repo', { path: '/repo' }]])
}))
// Why: the owner is confirmed against the catalog, which this test does not seed.
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => 'local'
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))

afterEach(cleanup)

describe('editor header path Open in', () => {
  it('opens the active file at the line the cursor is on', () => {
    const openInExternalEditor = vi.fn().mockResolvedValue({ ok: true })
    Object.assign(window, { api: { shell: { openInExternalEditor } } })
    const file: OpenFile = {
      id: '/repo/src/App.kt',
      filePath: '/repo/src/App.kt',
      relativePath: 'src/App.kt',
      worktreeId: 'repo-1::/repo',
      language: 'kotlin',
      isDirty: false,
      mode: 'edit'
    }
    const settings = useAppStore.getState().settings
    useAppStore.setState({
      openFiles: [file],
      editorCursorLine: { [file.id]: 17 },
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu reads only openInApplications from settings.
      settings: {
        ...settings,
        openInApplications: [{ id: 'studio', label: 'Android Studio', command: 'studio' }]
      } as NonNullable<typeof settings>
    })
    render(
      <EditorPanelHeaderPath
        activeFile={file}
        copiedPathVisible={false}
        canShowMarkdownPreview={false}
        onCopyPath={vi.fn()}
        onOpenMarkdownPreview={vi.fn()}
      />
    )

    const pathRow = document.querySelector('.editor-header-path-row')
    if (!pathRow) {
      throw new Error('Missing editor header path row')
    }
    fireEvent.contextMenu(pathRow)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Android Studio' }))

    expect(openInExternalEditor).toHaveBeenCalledExactlyOnceWith({
      path: '/repo/src/App.kt',
      line: 17,
      column: undefined,
      projectRoot: '/repo',
      command: 'studio',
      connectionId: null,
      ownerHostId: 'local'
    })
  })
})
