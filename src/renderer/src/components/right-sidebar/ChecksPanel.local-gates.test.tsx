// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { model, stage } = vi.hoisted(() => {
  const current: Record<string, unknown> = {}
  return { model: { current }, stage: (name: string) => ({ [name]: () => ({}) }) }
})

// Every stage of the panel's model is replaced: this test is about what the panel mounts, and the
// stages are covered by their own tests.
vi.mock('./checks-panel/use-checks-panel-controller-state', () => ({
  useChecksPanelControllerState: () => ({ ...model.current })
}))
vi.mock('./checks-panel/use-checks-panel-context-state', () => stage('useChecksPanelContextState'))
vi.mock('./checks-panel/use-checks-panel-review-state', () => stage('useChecksPanelReviewState'))
vi.mock('./checks-panel/use-checks-panel-generation', () => stage('useChecksPanelGeneration'))
vi.mock('./checks-panel/use-checks-panel-composer-state', () =>
  stage('useChecksPanelComposerState')
)
vi.mock('./checks-panel/use-checks-panel-foreground-effects', () =>
  stage('useChecksPanelForegroundEffects')
)
vi.mock('./checks-panel/use-checks-panel-git-status-effects', () =>
  stage('useChecksPanelGitStatusEffects')
)
vi.mock('./checks-panel/use-checks-panel-conflict-refresh', () =>
  stage('useChecksPanelConflictRefresh')
)
vi.mock('./checks-panel/use-checks-panel-polling', () => stage('useChecksPanelPolling'))
vi.mock('./checks-panel/use-checks-panel-review-data', () => stage('useChecksPanelReviewData'))
vi.mock('./checks-panel/use-checks-panel-manual-refresh', () =>
  stage('useChecksPanelManualRefresh')
)
vi.mock('./checks-panel/use-checks-panel-entry-refresh-and-title-actions', () =>
  stage('useChecksPanelEntryRefreshAndTitleActions')
)
vi.mock('./checks-panel/use-checks-panel-comment-resolution', () =>
  stage('useChecksPanelCommentResolution')
)
vi.mock('./checks-panel/use-checks-panel-comment-mutations', () =>
  stage('useChecksPanelCommentMutations')
)
vi.mock('./checks-panel/use-checks-panel-ai-queue', () => stage('useChecksPanelAiQueue'))
vi.mock('./checks-panel/use-checks-panel-ai-acknowledgement', () =>
  stage('useChecksPanelAiAcknowledgement')
)
vi.mock('./checks-panel/use-checks-panel-check-and-review-actions', () =>
  stage('useChecksPanelCheckAndReviewActions')
)
vi.mock('./checks-panel/use-checks-panel-branch-actions', () =>
  stage('useChecksPanelBranchActions')
)
vi.mock('./checks-panel/use-checks-panel-create-review', () => stage('useChecksPanelCreateReview'))
vi.mock('./checks-panel/empty-content', () => ({
  ChecksPanelEmptyContent: () => <div data-testid="hosted-empty" />
}))
vi.mock('./checks-panel/active-content', () => ({
  ChecksPanelActiveContent: () => <div data-testid="hosted-review" />
}))
vi.mock('@/components/HostedReviewUnlinkMenuItem', () => ({
  HostedReviewUnlinkMenuItem: () => null
}))
vi.mock('../quality-gates/WorkspaceQualityGatesSection', () => ({
  WorkspaceQualityGatesSection: (props: { worktreeId: string | null; visible: boolean }) => (
    <div
      data-testid="local-gates"
      data-worktree={props.worktreeId ?? ''}
      data-visible={String(props.visible)}
    />
  )
}))

import ChecksPanel from './ChecksPanel'

const WORKTREE = { id: 'repo::/work' }

function mounted(overrides: Record<string, unknown>): string[] {
  model.current = {
    activeWorktree: WORKTREE,
    activeWorktreeId: WORKTREE.id,
    isPanelVisible: true,
    isFolder: false,
    activeReview: null,
    ...overrides
  }
  const { container } = render(<ChecksPanel />)
  return [...container.querySelectorAll('[data-testid]')].map(
    (node) => node.getAttribute('data-testid') ?? ''
  )
}

describe('ChecksPanel local gates', () => {
  afterEach(cleanup)

  it.each([
    ['a GitHub pull request', { activeReview: { provider: 'github', number: 7 } }, 'hosted-review'],
    [
      'a GitLab merge request',
      { activeReview: { provider: 'gitlab', number: 7 } },
      'hosted-review'
    ],
    // The panel resolves no review for Azure DevOps, so it takes the empty branch.
    ['an Azure DevOps pull request', { linkedAzureDevOpsPR: 3740 }, 'hosted-empty'],
    ['no pull request', {}, 'hosted-empty'],
    ['a folder without git', { isFolder: true }, 'hosted-empty']
  ])(
    'mounts the local gates above the hosted part for a workspace with %s',
    (_name, state, rest) => {
      expect(mounted(state)).toEqual(['local-gates', rest])
      const gates = document.querySelector('[data-testid="local-gates"]')
      expect(gates?.getAttribute('data-worktree')).toBe('repo::/work')
      expect(gates?.getAttribute('data-visible')).toBe('true')
    }
  )

  it('passes on that the panel is hidden, so nothing is read behind a closed sidebar', () => {
    mounted({ isPanelVisible: false })
    expect(
      document.querySelector('[data-testid="local-gates"]')?.getAttribute('data-visible')
    ).toBe('false')
  })

  it('names no workspace when none is selected', () => {
    expect(mounted({ activeWorktree: null, activeWorktreeId: null })).toEqual([
      'local-gates',
      'hosted-empty'
    ])
    expect(
      document.querySelector('[data-testid="local-gates"]')?.getAttribute('data-worktree')
    ).toBe('')
  })
})
