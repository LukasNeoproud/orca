// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { rememberExternalEditorApplication } from './external-editor-last-application'
import { ExternalEditorOpenFileMenuSection } from './ExternalEditorOpenFileMenuSection'

const openInExternalEditorMock = vi.hoisted(() => vi.fn())

// Why: the owner is confirmed against the catalog, which this test does not seed.
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => 'local'
}))

afterEach(cleanup)

function openFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/repo/src/App.kt',
    filePath: '/repo/src/App.kt',
    relativePath: 'src/App.kt',
    worktreeId: 'repo-1::/repo',
    language: 'kotlin',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

function seedWorkspaceRoots(): void {
  useAppStore.setState({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the root lookup reads only id and path.
    worktreesByRepo: { 'repo-1': [{ id: 'repo-1::/repo', path: '/repo' } as Worktree] },
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the root lookup reads only id and folderPath.
    folderWorkspaces: [{ id: 'docs', folderPath: '/docs' } as FolderWorkspace]
  })
}

function renderMenu(file: OpenFile, line?: number): void {
  useAppStore.setState({ openFiles: [file] })
  render(
    <DropdownMenu open modal={false}>
      <DropdownMenuTrigger />
      <DropdownMenuContent>
        <ExternalEditorOpenFileMenuSection filePath={file.filePath} line={line} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('ExternalEditorOpenFileMenuSection', () => {
  beforeEach(() => {
    localStorage.clear()
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    Object.assign(window, { api: { shell: { openInExternalEditor: openInExternalEditorMock } } })
    useAppStore.setState({ worktreesByRepo: {}, folderWorkspaces: [] })
    const settings = useAppStore.getState().settings
    useAppStore.setState({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu reads only openInApplications from settings.
      settings: {
        ...settings,
        openInApplications: [
          { id: 'vscode', label: 'VS Code', command: 'code' },
          { id: 'studio', label: 'Android Studio', command: 'studio' }
        ]
      } as NonNullable<typeof settings>
    })
  })

  it('opens the tab file at the invoked line in the first application by default', () => {
    renderMenu(openFile(), 12)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledExactlyOnceWith({
      path: '/repo/src/App.kt',
      line: 12,
      column: undefined,
      command: 'code',
      connectionId: null,
      ownerHostId: 'local'
    })
  })

  it('defaults to the application last chosen for the repository of the file', () => {
    rememberExternalEditorApplication('repo-1', 'studio')
    renderMenu(openFile(), 3)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Android Studio' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/repo/src/App.kt', line: 3, command: 'studio' })
    )
  })

  it('keeps the choice of another repository out of this one', () => {
    rememberExternalEditorApplication('repo-2', 'studio')
    renderMenu(openFile())

    expect(screen.getByRole('menuitem', { name: 'Open in VS Code' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Open in Android Studio' })).toBeNull()
  })

  it('treats a folder workspace like a worktree, with its own remembered application', () => {
    rememberExternalEditorApplication('folder:docs', 'studio')
    renderMenu(
      openFile({ id: '/docs/notes.md', filePath: '/docs/notes.md', worktreeId: 'folder:docs' }),
      5
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Android Studio' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/docs/notes.md', line: 5, ownerHostId: 'local' })
    )
  })

  it('offers only a remote-capable default for a file on an SSH host', () => {
    rememberExternalEditorApplication('repo-1', 'studio')
    renderMenu(openFile({ externalSshTargetId: 'ssh-1' }), 8)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ line: 8, connectionId: 'ssh-1', ownerHostId: 'ssh:ssh-1' })
    )
  })

  it('sends the root of the worktree that holds the file', () => {
    seedWorkspaceRoots()
    renderMenu(openFile(), 12)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/repo/src/App.kt', line: 12, projectRoot: '/repo' })
    )
  })

  it('sends the folder of a folder workspace without git', () => {
    seedWorkspaceRoots()
    renderMenu(
      openFile({ id: '/docs/notes.md', filePath: '/docs/notes.md', worktreeId: 'folder:docs' }),
      5
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/docs/notes.md', projectRoot: '/docs' })
    )
  })

  it('keeps the root out of an SSH file', () => {
    seedWorkspaceRoots()
    renderMenu(openFile({ externalSshTargetId: 'ssh-1' }), 8)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'ssh-1', projectRoot: undefined })
    )
  })

  it('renders nothing for a tab without a file on disk', () => {
    renderMenu(openFile({ mode: 'git-graph' }))

    expect(screen.queryAllByRole('menuitem')).toEqual([])
  })
})
