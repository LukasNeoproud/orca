// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewPullRequest
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewDrafts } from './AzureDevOpsReviewDrafts'

const hostCastsVotes = vi.hoisted(() => vi.fn())

vi.mock('@/lib/azure-devops-review-client', () => ({
  azureDevOpsReviewHostCastsVotes: hostCastsVotes,
  publishAzureDevOpsReviewDrafts: vi.fn()
}))
vi.mock('./AzureDevOpsReviewDraftCard', () => ({ AzureDevOpsReviewDraftCard: () => null }))
vi.mock('./AzureDevOpsDraftComposer', () => ({ AzureDevOpsDraftComposer: () => null }))
vi.mock('./AzureDevOpsReviewPublishDialog', () => ({ AzureDevOpsReviewPublishDialog: () => null }))

function detail(patch: Partial<AzureDevOpsReviewPullRequest> = {}): AzureDevOpsReviewDetail {
  return {
    pullRequest: {
      key: 'dev.azure.com/contoso+repo+7',
      pullRequestId: 7,
      title: 'Clamp negative prices',
      description: '',
      status: 'active',
      isDraft: false,
      isFork: false,
      organizationKey: 'dev.azure.com/contoso',
      organizationLabel: 'contoso',
      project: 'Web',
      repository: 'app',
      repositoryId: 'repo',
      repoKey: 'dev.azure.com/contoso/web/app',
      author: { displayName: 'Ada Example', uniqueName: null },
      myVote: 'none',
      createdAt: '2026-11-17T09:00:00Z',
      closedAt: null,
      sourceBranch: 'feature/prices',
      targetBranch: 'main',
      sourceCommit: null,
      targetCommit: null,
      webUrl: 'https://dev.azure.com/contoso/Web/_git/app/pullrequest/7',
      ...patch
    },
    latestIteration: null,
    threads: [],
    changes: [],
    drafts: [],
    reviewWorktree: null
  }
}

async function voteButton(pullRequest: Partial<AzureDevOpsReviewPullRequest> = {}) {
  render(
    <AzureDevOpsReviewDrafts
      detail={detail(pullRequest)}
      onChanged={async () => undefined}
      onAskAi={() => undefined}
    />
  )
  // Lets the capability answer land and re-render before looking for the button.
  await act(async () => {
    await Promise.resolve()
  })
  expect(hostCastsVotes).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'General comment' })).toBeTruthy()
  return screen.queryByRole('button', { name: 'Vote' })
}

describe('offering a vote from the drafts tab', () => {
  beforeEach(() => {
    hostCastsVotes.mockReset()
    hostCastsVotes.mockResolvedValue(true)
  })
  afterEach(cleanup)

  it("offers a vote without any draft on someone else's open pull request", async () => {
    expect(await voteButton()).not.toBeNull()
  })

  it('offers a vote on a pull request from a fork', async () => {
    expect(await voteButton({ isFork: true })).not.toBeNull()
  })

  it.each([
    ['their own', { createdByMe: true as const }],
    ['a completed', { status: 'completed' as const }],
    ['an abandoned', { status: 'abandoned' as const }]
  ])('offers no vote on %s pull request', async (_name, patch) => {
    expect(await voteButton(patch)).toBeNull()
  })

  it('offers no vote against a host that cannot cast one', async () => {
    hostCastsVotes.mockResolvedValue(false)

    expect(await voteButton()).toBeNull()
  })
})
