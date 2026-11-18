// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiffSection } from '@/components/editor/diff-section-types'
import type { DiffSectionItemProps } from '@/components/editor/diff-section-item-props'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewAllChanges } from './AzureDevOpsReviewAllChanges'

const itemProps = vi.hoisted((): { current: DiffSectionItemProps[] } => ({ current: [] }))
const sections = vi.hoisted((): { current: DiffSection[] } => ({ current: [] }))

vi.mock('@/components/editor/DiffSectionItem', () => ({
  DiffSectionItem: (props: DiffSectionItemProps) => {
    itemProps.current.push(props)
    return null
  }
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => sections.current.map((_, index) => ({ index, key: index, start: 0 })),
    getTotalSize: () => 0,
    measure: () => {},
    measureElement: () => {},
    scrollToIndex: () => {}
  })
}))
vi.mock('./use-azure-devops-review-diff-sections', () => ({
  useAzureDevOpsReviewDiffSections: () => ({
    sections: sections.current,
    setSections: vi.fn(),
    loadSection: vi.fn(),
    retrySection: vi.fn(),
    toggleSection: vi.fn(),
    setAllSectionsCollapsed: vi.fn()
  })
}))
vi.mock('./use-azure-devops-review-inline-comments', () => ({
  useAzureDevOpsReviewInlineComments: () => ({ scope: 'pr-scope', comments: [], actions: {} })
}))
vi.mock('../editor/combined-diff/browse-files/combined-diff-file-tree', () => ({
  CombinedDiffFileTree: () => null
}))
vi.mock('./AzureDevOpsReviewIconButton', () => ({ AzureDevOpsReviewIconButton: () => null }))

afterEach(() => {
  cleanup()
  itemProps.current = []
})

const PULL_REQUEST_KEY = 'org+project+repo+42'

function change(path: string, changeType: AzureDevOpsReviewChange['changeType']) {
  return { path, originalPath: null, changeType, changeTrackingId: 1 }
}

function section(path: string, status: string): DiffSection {
  return {
    key: path,
    path,
    status,
    originalContent: '',
    modifiedContent: '',
    collapsed: false,
    loading: false,
    dirty: false,
    diffResult: null,
    largeDiffRenderLimit: null
  }
}

function renderAllChanges(checkedOutPullRequestKey: string | null): void {
  const changes = [change('app/src/Main.kt', 'edit'), change('app/src/Old.kt', 'delete')]
  sections.current = [section('app/src/Main.kt', 'modified'), section('app/src/Old.kt', 'deleted')]
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the view reads only the fields set here once its hooks are mocked.
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
    <AzureDevOpsReviewAllChanges
      detail={detail}
      entries={sections.current.map((s) => ({ path: s.path, status: 'modified' as const }))}
      changeByPath={new Map(changes.map((c) => [c.path, c]))}
      repoPath="/work/repo"
      viewModeToggle={null}
      onChanged={vi.fn()}
    />
  )
}

function availabilityFor(path: string) {
  const props = itemProps.current.findLast((p) => p.section.path === path)
  expect(props?.getExternalEditorFile).toBeTypeOf('function')
  return props!.getExternalEditorFile!(props!.section)
}

describe('AzureDevOpsReviewAllChanges Open in', () => {
  it('hands each section the file inside the review worktree of this pull request', () => {
    renderAllChanges(PULL_REQUEST_KEY)

    expect(availabilityFor('app/src/Main.kt')).toEqual({
      file: {
        filePath: '/work/repo-review-1/app/src/Main.kt',
        worktreeId: 'repo-1::/work/repo-review-1'
      }
    })
  })

  it('explains that a file the pull request deletes has nothing to open', () => {
    renderAllChanges(PULL_REQUEST_KEY)

    expect(availabilityFor('app/src/Old.kt')).toEqual({
      unavailableReason: 'This file is deleted, so there is nothing to open.'
    })
  })

  it('explains that the pull request is not checked out in the review worktree', () => {
    renderAllChanges('org+project+repo+7')

    expect(availabilityFor('app/src/Main.kt')).toEqual({
      unavailableReason:
        'The review workspace has another pull request checked out. Open this one in the workspace first.'
    })
  })

  it('explains that there is no review worktree yet', () => {
    renderAllChanges(null)

    expect(availabilityFor('app/src/Main.kt')).toEqual({
      unavailableReason:
        'Open this pull request in its review workspace first; IDEs open files from there.'
    })
  })
})
