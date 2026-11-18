// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { editor } from 'monaco-editor'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { ExternalEditorFileAvailability } from './external-editor-file-availability'
import { ExternalEditorDiffSectionGutterMenu } from './ExternalEditorDiffSectionGutterMenu'

const openInExternalEditorMock = vi.hoisted(() => vi.fn())

vi.mock('monaco-editor', () => ({
  editor: { MouseTargetType: { CONTENT_TEXT: 6, CONTENT_EMPTY: 7 } }
}))
// Why: the owner is confirmed against the catalog, which this test does not seed.
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => 'local'
}))

const LINE_HEIGHT = 20
const CONTENT_LEFT = 50

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

/** A modified-side editor whose rows are LINE_HEIGHT tall and whose text starts at CONTENT_LEFT. */
function fakeModifiedEditor(lineCount: number): {
  codeEditor: editor.ICodeEditor
  dom: HTMLElement
} {
  const dom = document.createElement('div')
  document.body.append(dom)
  const target = (_x: number, y: number) => {
    const lineNumber = Math.floor(y / LINE_HEIGHT) + 1
    return lineNumber <= lineCount
      ? { type: 6, position: { lineNumber, column: 1 }, detail: {} }
      : { type: 7, position: { lineNumber: lineCount, column: 1 }, detail: { isAfterLines: true } }
  }
  const codeEditor = {
    getDomNode: () => dom,
    getLayoutInfo: () => ({ contentLeft: CONTENT_LEFT }),
    getTargetAtClientPoint: target
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the gutter menu calls only the three methods defined here.
  return { codeEditor: codeEditor as unknown as editor.ICodeEditor, dom }
}

function rightClickGutterLine(dom: HTMLElement, line: number): void {
  fireEvent.contextMenu(dom, { clientX: 10, clientY: (line - 1) * LINE_HEIGHT + 5 })
}

function renderMenu(availability: ExternalEditorFileAvailability | null, lineCount = 30) {
  const { codeEditor, dom } = fakeModifiedEditor(lineCount)
  render(<ExternalEditorDiffSectionGutterMenu editor={codeEditor} availability={availability} />)
  return dom
}

describe('ExternalEditorDiffSectionGutterMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    Object.assign(window, { api: { shell: { openInExternalEditor: openInExternalEditorMock } } })
    const settings = useAppStore.getState().settings
    useAppStore.setState({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu reads only openInApplications from settings.
      settings: {
        ...settings,
        openInApplications: [{ id: 'vscode', label: 'VS Code', command: 'code' }]
      } as NonNullable<typeof settings>
    })
  })

  it('opens the section file at the right-clicked gutter line', () => {
    const dom = renderMenu({
      file: { filePath: '/repo/src/App.kt', worktreeId: 'repo-1::/repo' }
    })

    rightClickGutterLine(dom, 7)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledExactlyOnceWith({
      path: '/repo/src/App.kt',
      line: 7,
      column: undefined,
      command: 'code',
      connectionId: null,
      ownerHostId: 'local'
    })
  })

  it('opens a file on an SSH host only through a remote-capable application', () => {
    const dom = renderMenu({
      file: {
        filePath: '/srv/repo/a.ts',
        worktreeId: 'repo-1::/srv/repo',
        externalSshTargetId: 'ssh-1'
      }
    })

    rightClickGutterLine(dom, 3)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    expect(openInExternalEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ line: 3, connectionId: 'ssh-1', ownerHostId: 'ssh:ssh-1' })
    )
  })

  it('ignores a right-click on the code itself', () => {
    const dom = renderMenu({ file: { filePath: '/repo/a.ts', worktreeId: 'repo-1::/repo' } })

    fireEvent.contextMenu(dom, { clientX: CONTENT_LEFT + 40, clientY: 25 })

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('says why Open in is unavailable instead of opening anything', () => {
    const dom = renderMenu(
      { unavailableReason: 'This file is deleted, so there is nothing to open.' },
      0
    )

    rightClickGutterLine(dom, 2)

    const openIn = screen.getByRole('menuitem', { name: 'Open in' })
    expect(openIn.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('This file is deleted, so there is nothing to open.')).toBeTruthy()
    fireEvent.click(openIn)
    expect(openInExternalEditorMock).not.toHaveBeenCalled()
  })

  it('keeps Monaco context menu for a section that offers nothing', () => {
    const dom = renderMenu(null)

    rightClickGutterLine(dom, 2)

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
