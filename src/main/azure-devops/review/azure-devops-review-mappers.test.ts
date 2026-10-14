import { describe, expect, it } from 'vitest'
import { buildAzureDevOpsThreadPayload } from './azure-devops-review-thread-payload'
import {
  mapAzureDevOpsReviewChange,
  mapAzureDevOpsReviewPullRequest,
  mapAzureDevOpsReviewThread,
  mapAzureDevOpsReviewVote
} from './azure-devops-review-mappers'
import type { AzureDevOpsReviewRepo } from '../../../shared/azure-devops-review-types'

const repo: AzureDevOpsReviewRepo = {
  key: 'dev.azure.com/contoso/web/app',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'app',
  orcaRepoIds: ['r1']
}

describe('mapAzureDevOpsReviewPullRequest', () => {
  it('maps branches, my vote, fork flag and web URL', () => {
    const mapped = mapAzureDevOpsReviewPullRequest(
      {
        pullRequestId: 42,
        title: 'Add login',
        status: 'active',
        isDraft: true,
        sourceRefName: 'refs/heads/feature/login',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'Ada' },
        reviewers: [
          { id: 'ME', vote: 5 },
          { id: 'other', vote: -10 }
        ],
        lastMergeSourceCommit: { commitId: 'abc' },
        forkSource: { name: 'refs/heads/x' }
      },
      {
        repo,
        repositoryId: 'REPO',
        repositoryWebUrl: 'https://dev.azure.com/contoso/Web/_git/app/',
        meId: 'me'
      }
    )
    expect(mapped).toMatchObject({
      key: 'dev.azure.com/contoso+repo+42',
      sourceBranch: 'feature/login',
      targetBranch: 'main',
      isDraft: true,
      isFork: true,
      myVote: 'approved-with-suggestions',
      sourceCommit: 'abc',
      webUrl: 'https://dev.azure.com/contoso/Web/_git/app/pullrequest/42'
    })
  })

  it('marks pull requests the signed-in identity created', () => {
    const context = { repo, repositoryId: 'r', repositoryWebUrl: '', meId: 'me' }
    const mine = mapAzureDevOpsReviewPullRequest(
      { pullRequestId: 1, createdBy: { id: 'ME' } },
      context
    )
    const theirs = mapAzureDevOpsReviewPullRequest(
      { pullRequestId: 2, createdBy: { id: 'other' } },
      context
    )
    expect(mine?.createdByMe).toBe(true)
    expect(theirs).not.toHaveProperty('createdByMe')
  })

  it('drops payloads without an id', () => {
    expect(
      mapAzureDevOpsReviewPullRequest(
        {},
        { repo, repositoryId: 'r', repositoryWebUrl: '', meId: null }
      )
    ).toBeNull()
  })
})

describe('mapAzureDevOpsReviewVote', () => {
  it('maps Azure DevOps vote numbers', () => {
    expect([10, 5, 0, -5, -10, null].map(mapAzureDevOpsReviewVote)).toEqual([
      'approved',
      'approved-with-suggestions',
      'none',
      'waiting-for-author',
      'rejected',
      'none'
    ])
  })
})

describe('mapAzureDevOpsReviewThread', () => {
  it('maps anchored threads and strips the rooted item path', () => {
    expect(
      mapAzureDevOpsReviewThread({
        id: 3,
        status: 'fixed',
        threadContext: {
          filePath: '/src/a.ts',
          rightFileStart: { line: 10, offset: 1 },
          rightFileEnd: { line: 12, offset: 4 }
        },
        comments: [{ id: 1, content: 'Hmm', author: { displayName: 'Ada' }, commentType: 'text' }]
      })
    ).toMatchObject({
      id: 3,
      status: 'fixed',
      filePath: 'src/a.ts',
      anchor: { side: 'right', startLine: 10, endLine: 12 }
    })
  })

  it('drops deleted and system-only threads', () => {
    expect(mapAzureDevOpsReviewThread({ id: 1, isDeleted: true, comments: [] })).toBeNull()
    expect(
      mapAzureDevOpsReviewThread({
        id: 2,
        comments: [{ id: 1, content: 'voted', commentType: 'system' }]
      })
    ).toBeNull()
  })
})

describe('mapAzureDevOpsReviewChange', () => {
  it('classifies combined change types', () => {
    expect(
      mapAzureDevOpsReviewChange({
        item: { path: '/b.ts' },
        changeType: 'edit, rename',
        originalPath: '/a.ts'
      })
    ).toEqual({ path: 'b.ts', originalPath: 'a.ts', changeType: 'rename', changeTrackingId: null })
  })
})

describe('buildAzureDevOpsThreadPayload', () => {
  it('anchors inline drafts to a line range and iteration', () => {
    expect(
      buildAzureDevOpsThreadPayload(
        {
          kind: 'inline',
          filePath: 'src/a.ts',
          anchor: { side: 'left', startLine: 3, endLine: 5 },
          body: 'Why?'
        },
        { iterationId: 4, changeTrackingId: 9 }
      )
    ).toEqual({
      comments: [{ parentCommentId: 0, content: 'Why?', commentType: 1 }],
      status: 1,
      threadContext: {
        filePath: '/src/a.ts',
        leftFileStart: { line: 3, offset: 1 },
        leftFileEnd: { line: 5, offset: 10_000 }
      },
      pullRequestThreadContext: {
        iterationContext: { firstComparingIteration: 1, secondComparingIteration: 4 },
        changeTrackingId: 9
      }
    })
  })

  it('sends general comments without a file context', () => {
    expect(
      buildAzureDevOpsThreadPayload(
        { kind: 'general', filePath: null, anchor: null, body: 'LGTM' },
        { iterationId: 2, changeTrackingId: null }
      )
    ).toEqual({ comments: [{ parentCommentId: 0, content: 'LGTM', commentType: 1 }], status: 1 })
  })
})
