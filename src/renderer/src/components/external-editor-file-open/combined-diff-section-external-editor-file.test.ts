import { describe, expect, it } from 'vitest'
import { getCombinedDiffSectionExternalEditorFile } from './combined-diff-section-external-editor-file'

const combinedDiff = {
  filePath: '/work/repo',
  worktreeId: 'repo-1::/work/repo',
  runtimeEnvironmentId: null,
  externalSshTargetId: undefined
}

describe('getCombinedDiffSectionExternalEditorFile', () => {
  it('points at the section file inside the workspace of the combined diff', () => {
    expect(
      getCombinedDiffSectionExternalEditorFile(combinedDiff, {
        path: 'src/App.kt',
        status: 'modified'
      })
    ).toEqual({
      file: {
        filePath: '/work/repo/src/App.kt',
        worktreeId: 'repo-1::/work/repo',
        runtimeEnvironmentId: null,
        externalSshTargetId: undefined
      }
    })
  })

  it('joins a Windows workspace with its own separator', () => {
    expect(
      getCombinedDiffSectionExternalEditorFile(
        { ...combinedDiff, filePath: 'C:\\work\\repo' },
        { path: 'src/App.kt', status: 'added' }
      )
    ).toEqual({ file: expect.objectContaining({ filePath: 'C:\\work\\repo\\src\\App.kt' }) })
  })

  it('keeps the SSH target so only remote-capable applications are offered', () => {
    expect(
      getCombinedDiffSectionExternalEditorFile(
        { ...combinedDiff, externalSshTargetId: 'ssh-1' },
        { path: 'a.ts', status: 'modified' }
      )
    ).toEqual({ file: expect.objectContaining({ externalSshTargetId: 'ssh-1' }) })
  })

  it('explains that a deleted file has nothing to open', () => {
    expect(
      getCombinedDiffSectionExternalEditorFile(combinedDiff, { path: 'old.ts', status: 'deleted' })
    ).toEqual({ unavailableReason: 'This file is deleted, so there is nothing to open.' })
  })
})
