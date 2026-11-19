import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewThread
} from '../shared/azure-devops-review-types'
import { formatAzureDevOpsPullRequestDetail } from './azure-devops-format'

function thread(overrides: Partial<AzureDevOpsReviewThread>): AzureDevOpsReviewThread {
  return {
    id: 1,
    status: 'active',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 9, endLine: 9 },
    comments: [],
    ...overrides
  }
}

function detail(threads: AzureDevOpsReviewThread[]): AzureDevOpsReviewDetail {
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
      author: { displayName: 'Ada', uniqueName: null },
      myVote: 'none',
      createdAt: '',
      closedAt: null,
      sourceBranch: 'feature/prices',
      targetBranch: 'main',
      sourceCommit: 's4',
      targetCommit: 't',
      webUrl: 'https://dev.azure.com/contoso/Web/_git/app/pullrequest/7'
    },
    latestIteration: { id: 4, sourceCommit: 's4', targetCommit: 't', baseCommit: 'b' },
    threads,
    changes: [],
    drafts: [],
    reviewWorktree: null
  }
}

describe('formatAzureDevOpsPullRequestDetail', () => {
  it('prints each thread at its line in the latest iteration', () => {
    const printed = formatAzureDevOpsPullRequestDetail(
      detail([
        thread({ originalAnchor: { side: 'right', startLine: 6, endLine: 6 }, iterationId: 1 }),
        thread({ id: 2, filePath: null, anchor: null })
      ])
    )
    expect(printed).toContain('  #1 [active] src/cart.ts:9')
    expect(printed).toContain('  #2 [active] general')
  })

  it('marks outdated threads and says where one without a line was written', () => {
    const originalAnchor = { side: 'right' as const, startLine: 4, endLine: 5 }
    const printed = formatAzureDevOpsPullRequestDetail(
      detail([
        thread({ anchor: { side: 'right', startLine: 6, endLine: 6 }, outdated: true }),
        thread({
          id: 2,
          status: 'fixed',
          anchor: null,
          outdated: true,
          originalAnchor,
          iterationId: 1
        })
      ])
    )
    expect(printed).toContain('  #1 [active, outdated] src/cart.ts:6')
    expect(printed).toContain('  #2 [fixed, outdated] src/cart.ts (was lines 4-5 of iteration 1)')
  })
})
