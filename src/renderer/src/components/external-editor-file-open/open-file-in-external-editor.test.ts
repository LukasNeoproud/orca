// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExternalEditorFileTarget } from './external-editor-file-target'
import { readLastExternalEditorApplicationId } from './external-editor-last-application'
import { openFileInExternalEditor } from './open-file-in-external-editor'

const { openInExternalEditorMock, toastErrorMock } = vi.hoisted(() => ({
  openInExternalEditorMock: vi.fn(),
  toastErrorMock: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const studio = { id: 'studio', label: 'Android Studio', command: 'studio' }
const vscode = { id: 'vscode', label: 'VS Code', command: 'code' }

function target(overrides: Partial<ExternalEditorFileTarget> = {}): ExternalEditorFileTarget {
  return {
    filePath: '/repo/src/App.kt',
    preferenceKey: 'repo-1',
    connectionId: null,
    runtimeEnvironmentId: null,
    ownerUnresolved: false,
    ...overrides
  }
}

describe('openFileInExternalEditor', () => {
  beforeEach(() => {
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    toastErrorMock.mockReset()
    localStorage.clear()
    Object.assign(window, { api: { shell: { openInExternalEditor: openInExternalEditorMock } } })
  })

  it('sends the workspace file, line and column to the chosen application', async () => {
    await openFileInExternalEditor({ target: target(), application: studio, line: 42, column: 7 })

    expect(openInExternalEditorMock).toHaveBeenCalledExactlyOnceWith({
      path: '/repo/src/App.kt',
      line: 42,
      column: 7,
      command: 'studio',
      connectionId: null,
      ownerHostId: 'local'
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('remembers the application per repository once it opened the file', async () => {
    await openFileInExternalEditor({ target: target(), application: studio, line: 1 })
    await openFileInExternalEditor({
      target: target({ preferenceKey: 'folder:docs' }),
      application: vscode
    })

    expect(readLastExternalEditorApplicationId('repo-1')).toBe('studio')
    expect(readLastExternalEditorApplicationId('folder:docs')).toBe('vscode')
    expect(readLastExternalEditorApplicationId('repo-2')).toBeNull()
  })

  it('does not remember an application that failed to launch, and says which one', async () => {
    openInExternalEditorMock.mockResolvedValue({ ok: false, reason: 'launch-failed' })

    await openFileInExternalEditor({ target: target(), application: studio, line: 1 })

    expect(readLastExternalEditorApplicationId('repo-1')).toBeNull()
    expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
      'Could not open the file in Android Studio.',
      { description: 'Check the command configured for this app in Settings.' }
    )
  })

  it('reports a file that is missing from the workspace', async () => {
    openInExternalEditorMock.mockResolvedValue({ ok: false, reason: 'not-found' })

    await openFileInExternalEditor({ target: target(), application: vscode, line: 1 })

    expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
      'File not found. It may have been moved or deleted.'
    )
  })

  it('opens an SSH file through its connection with the SSH host as owner', async () => {
    await openFileInExternalEditor({
      target: target({ filePath: '/srv/repo/App.kt', connectionId: 'ssh-1' }),
      application: vscode,
      line: 9
    })

    expect(openInExternalEditorMock).toHaveBeenCalledExactlyOnceWith({
      path: '/srv/repo/App.kt',
      line: 9,
      column: undefined,
      command: 'code',
      connectionId: 'ssh-1',
      ownerHostId: 'ssh:ssh-1'
    })
  })

  it('refuses an application without remote support for an SSH file', async () => {
    await openFileInExternalEditor({
      target: target({ connectionId: 'ssh-1' }),
      application: studio,
      line: 9
    })

    expect(openInExternalEditorMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith('This app cannot open SSH workspaces.', {
      description: 'Choose VS Code or use the app locally.'
    })
  })

  it.each([{ runtimeEnvironmentId: 'env-1' }, { ownerUnresolved: true }])(
    'refuses a file another runtime owns or nobody could place: %o',
    async (overrides) => {
      await openFileInExternalEditor({ target: target(overrides), application: vscode, line: 9 })

      expect(openInExternalEditorMock).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Opening this path in a local app is not available.',
        { description: 'Switch to a local or SSH workspace, then try again.' }
      )
    }
  )
})
