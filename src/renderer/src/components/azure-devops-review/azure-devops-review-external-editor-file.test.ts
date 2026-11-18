import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { getAzureDevOpsReviewExternalEditorFile } from './azure-devops-review-external-editor-file'

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

describe('getAzureDevOpsReviewExternalEditorFile', () => {
  it('points at the file inside the review worktree, not the main checkout', () => {
    expect(getAzureDevOpsReviewExternalEditorFile(detail(reviewWorktree()), change())).toEqual({
      filePath: '/work/repo-review-1/app/src/Main.kt',
      worktreeId: 'repo-1::/work/repo-review-1'
    })
  })

  it('joins a Windows review worktree with its own separator', () => {
    expect(
      getAzureDevOpsReviewExternalEditorFile(
        detail(reviewWorktree({ path: 'C:\\work\\repo-review-1' })),
        change()
      )?.filePath
    ).toBe('C:\\work\\repo-review-1\\app\\src\\Main.kt')
  })

  it('offers nothing without a review worktree', () => {
    expect(getAzureDevOpsReviewExternalEditorFile(detail(null), change())).toBeNull()
  })

  it('offers nothing while the review worktree has another pull request checked out', () => {
    expect(
      getAzureDevOpsReviewExternalEditorFile(
        detail(reviewWorktree({ pullRequestKey: 'org+project+repo+7' })),
        change()
      )
    ).toBeNull()
  })

  it('offers nothing for a file the pull request deletes', () => {
    expect(
      getAzureDevOpsReviewExternalEditorFile(
        detail(reviewWorktree()),
        change({ changeType: 'delete' })
      )
    ).toBeNull()
  })
})
