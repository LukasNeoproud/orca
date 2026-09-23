import { describe, expect, it } from 'vitest'
import { readMobileReviewGitDiffResult } from './mobile-diff-review-rpc'

describe('readMobileReviewGitDiffResult', () => {
  it('preserves bounded binary image payload metadata for image review', () => {
    expect(
      readMobileReviewGitDiffResult({
        kind: 'binary',
        originalContent: 'b2xk',
        modifiedContent: 'bmV3',
        originalIsBinary: true,
        modifiedIsBinary: true,
        isImage: true,
        mimeType: 'image/png'
      })
    ).toEqual({
      kind: 'binary',
      originalContent: 'b2xk',
      modifiedContent: 'bmV3',
      originalIsBinary: true,
      modifiedIsBinary: true,
      modifiedDeleted: undefined,
      isImage: true,
      mimeType: 'image/png'
    })
  })

  it('falls back to a non-previewable binary state for older hosts without image fields', () => {
    expect(readMobileReviewGitDiffResult({ kind: 'binary', isImage: true })).toEqual({
      kind: 'binary'
    })
  })
})
