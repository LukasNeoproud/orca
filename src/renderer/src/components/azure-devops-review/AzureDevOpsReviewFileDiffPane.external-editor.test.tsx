// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import type { DiffViewerProps } from '../editor/diff-viewer-props'
import { AzureDevOpsReviewFileDiffPane } from './AzureDevOpsReviewFileDiffPane'

const diffViewerProps = vi.hoisted((): { current: DiffViewerProps | null } => ({ current: null }))

vi.mock('@/components/editor/DiffViewer', () => ({
  default: (props: DiffViewerProps) => {
    diffViewerProps.current = props
    return null
  }
}))
vi.mock('./use-azure-devops-review-file-diff', () => ({
  useAzureDevOpsReviewFileDiff: () => ({
    diff: {
      iterationId: 3,
      original: { content: 'a\n', missing: false, binary: false, tooLarge: false },
      modified: { content: 'b\n', missing: false, binary: false, tooLarge: false }
    },
    loading: false,
    error: null,
    retry: vi.fn()
  })
}))
vi.mock('./use-azure-devops-review-inline-comments', () => ({
  useAzureDevOpsReviewInlineComments: () => ({ scope: 'pr-scope', comments: [], actions: {} })
}))
vi.mock('./AzureDevOpsReviewFileComments', () => ({ AzureDevOpsReviewFileComments: () => null }))
vi.mock('./AzureDevOpsDraftComposer', () => ({ AzureDevOpsDraftComposer: () => null }))
vi.mock('./AzureDevOpsReviewIconButton', () => ({ AzureDevOpsReviewIconButton: () => null }))

afterEach(() => {
  cleanup()
  diffViewerProps.current = null
})

const PULL_REQUEST_KEY = 'org+project+repo+42'
const change: AzureDevOpsReviewChange = {
  path: 'app/src/Main.kt',
  originalPath: null,
  changeType: 'edit',
  changeTrackingId: 1
}

function renderPane(checkedOutPullRequestKey: string | null): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the pane reads only the fields set here once its hooks are mocked.
  const detail = {
    pullRequest: { key: PULL_REQUEST_KEY, webUrl: 'https://example.invalid/pr/42' },
    latestIteration: { id: 3 },
    reviewWorktree: checkedOutPullRequestKey
      ? {
          worktreeId: 'repo-1::/work/repo-review-1',
          repoId: 'repo-1',
          path: '/work/repo-review-1',
          pullRequestKey: checkedOutPullRequestKey,
          commit: 'abc123'
        }
      : null
  } as AzureDevOpsReviewDetail
  render(
    <AzureDevOpsReviewFileDiffPane
      detail={detail}
      change={change}
      treeCollapsed={false}
      onShowTree={vi.fn()}
      viewModeToggle={null}
      onChanged={vi.fn()}
    />
  )
}

describe('AzureDevOpsReviewFileDiffPane Open in target', () => {
  it('hands the diff the file inside the review worktree of this pull request', () => {
    renderPane(PULL_REQUEST_KEY)

    expect(diffViewerProps.current?.externalEditorFile).toEqual({
      filePath: '/work/repo-review-1/app/src/Main.kt',
      worktreeId: 'repo-1::/work/repo-review-1'
    })
  })

  it('offers no file while the review worktree holds another pull request', () => {
    renderPane('org+project+repo+7')

    expect(diffViewerProps.current).not.toBeNull()
    expect(diffViewerProps.current?.externalEditorFile).toBeNull()
  })

  it('offers no file before the pull request is checked out', () => {
    renderPane(null)

    expect(diffViewerProps.current?.externalEditorFile).toBeNull()
  })
})
