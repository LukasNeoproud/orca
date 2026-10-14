import { describe, expect, it } from 'vitest'
import {
  azureDevOpsAutoReviewCandidates,
  normalizeAzureDevOpsAutoReviewSettings
} from './azure-devops-auto-review'
import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

function pullRequest(
  key: string,
  overrides: Partial<AzureDevOpsReviewPullRequest> = {}
): AzureDevOpsReviewPullRequest {
  return {
    key,
    pullRequestId: 1,
    title: 'Change',
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: 'dev.azure.com/contoso',
    organizationLabel: 'contoso',
    project: 'proj',
    repository: 'app',
    repositoryId: 'repo',
    repoKey: 'dev.azure.com/contoso+repo',
    author: { displayName: 'Author', uniqueName: null },
    myVote: 'none',
    createdAt: '',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: '',
    ...overrides
  }
}

describe('azureDevOpsAutoReviewCandidates', () => {
  it('offers only open, unseen pull requests the user has not authored, voted on or drafted', () => {
    const candidates = azureDevOpsAutoReviewCandidates(
      {
        pullRequests: [
          pullRequest('new'),
          pullRequest('seen'),
          pullRequest('mine', { createdByMe: true }),
          pullRequest('voted', { myVote: 'approved' }),
          pullRequest('drafted'),
          pullRequest('draft-pr', { isDraft: true }),
          pullRequest('fork', { isFork: true }),
          pullRequest('merged', { status: 'completed' })
        ],
        draftCounts: { drafted: 2 }
      },
      new Set(['seen'])
    )
    expect(candidates.map((pr) => pr.key)).toEqual(['new'])
  })
})

describe('normalizeAzureDevOpsAutoReviewSettings', () => {
  it('defaults to checking every 15 minutes', () => {
    expect(normalizeAzureDevOpsAutoReviewSettings(null)).toEqual({
      enabled: true,
      intervalMinutes: 15
    })
  })

  it('keeps the interval within one minute and one day', () => {
    expect(normalizeAzureDevOpsAutoReviewSettings({ intervalMinutes: 0 }).intervalMinutes).toBe(1)
    expect(normalizeAzureDevOpsAutoReviewSettings({ intervalMinutes: 5000 }).intervalMinutes).toBe(
      1440
    )
    expect(
      normalizeAzureDevOpsAutoReviewSettings({ enabled: false, intervalMinutes: 7.4 })
    ).toEqual({ enabled: false, intervalMinutes: 7 })
  })
})
