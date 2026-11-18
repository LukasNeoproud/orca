import { describe, expect, it, vi } from 'vitest'
import {
  getExternalEditorFileOpenEntries,
  pickDefaultExternalEditorFileOpenEntry
} from './external-editor-file-open-entries'
import type { ExternalEditorFileTarget } from './external-editor-file-target'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))

const applications = [
  { id: 'vscode', label: 'VS Code', command: 'code' },
  { id: 'studio', label: 'Android Studio', command: 'studio' },
  { id: 'xcode', label: 'Xcode', command: 'xed' }
]

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

describe('getExternalEditorFileOpenEntries', () => {
  it('offers the applications of the worktree Open in menu, without the file manager', () => {
    expect(getExternalEditorFileOpenEntries(applications, target())).toEqual([
      { id: 'vscode', label: 'VS Code', command: 'code', disabled: false },
      { id: 'studio', label: 'Android Studio', command: 'studio', disabled: false },
      { id: 'xcode', label: 'Xcode', command: 'xed', disabled: false }
    ])
  })

  it('keeps only remote-capable applications enabled for an SSH file and says why', () => {
    expect(
      getExternalEditorFileOpenEntries(applications, target({ connectionId: 'ssh-1' }))
    ).toEqual([
      { id: 'vscode', label: 'VS Code', command: 'code', disabled: false, metadata: 'Remote SSH' },
      {
        id: 'studio',
        label: 'Android Studio',
        command: 'studio',
        disabled: true,
        metadata: 'Local only'
      },
      { id: 'xcode', label: 'Xcode', command: 'xed', disabled: true, metadata: 'Local only' }
    ])
  })

  it.each([{ runtimeEnvironmentId: 'env-1' }, { ownerUnresolved: true }])(
    'disables every application for a file this computer cannot place: %o',
    (overrides) => {
      expect(
        getExternalEditorFileOpenEntries(applications, target(overrides)).map((e) => e.disabled)
      ).toEqual([true, true, true])
    }
  )
})

describe('pickDefaultExternalEditorFileOpenEntry', () => {
  const local = getExternalEditorFileOpenEntries(applications, target())

  it('defaults to the application last chosen for the repository', () => {
    expect(pickDefaultExternalEditorFileOpenEntry(local, 'studio')?.id).toBe('studio')
  })

  it('falls back to the first application without a remembered or still configured choice', () => {
    expect(pickDefaultExternalEditorFileOpenEntry(local, null)?.id).toBe('vscode')
    expect(pickDefaultExternalEditorFileOpenEntry(local, 'removed-app')?.id).toBe('vscode')
  })

  it('skips a remembered application that cannot open an SSH file', () => {
    const remote = getExternalEditorFileOpenEntries(applications, target({ connectionId: 'ssh-1' }))
    expect(pickDefaultExternalEditorFileOpenEntry(remote, 'studio')?.id).toBe('vscode')
  })

  it('has no default when nothing can open the file', () => {
    const remote = getExternalEditorFileOpenEntries(
      applications.slice(1),
      target({ connectionId: 'ssh-1' })
    )
    expect(pickDefaultExternalEditorFileOpenEntry(remote, 'studio')).toBeNull()
    expect(pickDefaultExternalEditorFileOpenEntry([], null)).toBeNull()
  })
})
