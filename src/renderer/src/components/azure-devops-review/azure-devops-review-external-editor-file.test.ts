import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { getAzureDevOpsReviewExternalEditorAvailability } from './azure-devops-review-external-editor-file'

const PULL_REQUEST_KEY = 'org+project+repo+42'

function detail(
  reviewWorktree: AzureDevOpsReviewDetail['reviewWorktree']
): AzureDevOpsReviewDetail {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the function reads only pullRequest.key and reviewWorktree.
  return { pullRequest: { key: PULL_REQUEST_KEY }, reviewWorktree } as AzureDevOpsReviewDetail
}

function change(overrides: Partial<AzureDevOpsReviewChange> = {}): AzureDevOpsReviewChange {
  return {
    path: 'app/src/Main.kt',
    originalPath: null,
    changeType: 'edit',
    changeTrackingId: 1,
    ...overrides
  }
}

function reviewWorktree(
  overrides: Partial<NonNullable<AzureDevOpsReviewDetail['reviewWorktree']>> = {}
): NonNullable<AzureDevOpsReviewDetail['reviewWorktree']> {
  return {
    worktreeId: 'repo-1::/work/repo-review-1',
    repoId: 'repo-1',
    path: '/work/repo-review-1',
    pullRequestKey: PULL_REQUEST_KEY,
    commit: 'abc123',
    ...overrides
  }
}

describe('getAzureDevOpsReviewExternalEditorAvailability', () => {
  it('points at the file inside the review worktree, not the main checkout', () => {
    expect(
      getAzureDevOpsReviewExternalEditorAvailability(detail(reviewWorktree()), change())
    ).toEqual({
      file: {
        filePath: '/work/repo-review-1/app/src/Main.kt',
        worktreeId: 'repo-1::/work/repo-review-1'
      }
    })
  })

  it('joins a Windows review worktree with its own separator', () => {
    expect(
      getAzureDevOpsReviewExternalEditorAvailability(
        detail(reviewWorktree({ path: 'C:\\work\\repo-review-1' })),
        change()
      )
    ).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({ filePath: 'C:\\work\\repo-review-1\\app\\src\\Main.kt' })
      })
    )
  })

  it('explains that the pull request is not open in a review worktree yet', () => {
    expect(getAzureDevOpsReviewExternalEditorAvailability(detail(null), change())).toEqual({
      unavailableReason:
        'Open this pull request in its review workspace first; IDEs open files from there.'
    })
  })

  it('explains that the review worktree has another pull request checked out', () => {
    expect(
      getAzureDevOpsReviewExternalEditorAvailability(
        detail(reviewWorktree({ pullRequestKey: 'org+project+repo+7' })),
        change()
      )
    ).toEqual({
      unavailableReason:
        'The review workspace has another pull request checked out. Open this one in the workspace first.'
    })
  })

  it('explains that a file the pull request deletes has nothing to open', () => {
    expect(
      getAzureDevOpsReviewExternalEditorAvailability(
        detail(reviewWorktree()),
        change({ changeType: 'delete' })
      )
    ).toEqual({ unavailableReason: 'This file is deleted, so there is nothing to open.' })
  })
})
