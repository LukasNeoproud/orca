import { describe, expect, it } from 'vitest'
import { toAzureDevOpsReviewFileSide } from './azure-devops-review-file-diff'
import { compareAzureDevOpsReviewPullRequestsNewestFirst } from './azure-devops-review-service'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

describe('toAzureDevOpsReviewFileSide', () => {
  it('distinguishes missing, binary, oversized and text content', () => {
    expect(toAzureDevOpsReviewFileSide(null)).toMatchObject({ missing: true, content: '' })
    expect(toAzureDevOpsReviewFileSide({ contentMetadata: { isBinary: true } })).toMatchObject({
      binary: true
    })
    expect(toAzureDevOpsReviewFileSide({ content: 'x'.repeat(2_000_001) })).toMatchObject({
      tooLarge: true,
      content: ''
    })
    expect(toAzureDevOpsReviewFileSide({ content: 'a\nb' })).toEqual({
      content: 'a\nb',
      missing: false,
      binary: false,
      tooLarge: false
    })
  })
})

describe('compareAzureDevOpsReviewPullRequestsNewestFirst', () => {
  const pr = (pullRequestId: number, createdAt: string) =>
    ({ pullRequestId, createdAt }) as AzureDevOpsReviewPullRequest

  it('orders by creation date, newest first, with PR id breaking ties', () => {
    const sorted = [
      pr(1, '2025-12-01T00:00:00Z'),
      pr(3, '2026-06-02T00:00:00Z'),
      pr(2, '2026-06-02T00:00:00Z'),
      pr(9, '')
    ].sort(compareAzureDevOpsReviewPullRequestsNewestFirst)
    expect(sorted.map((item) => item.pullRequestId)).toEqual([3, 2, 1, 9])
  })
})
