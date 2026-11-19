import { describe, expect, it } from 'vitest'
import { AZURE_DEVOPS_REVIEW_CASTABLE_VOTES } from '../azure-devops-review-vote'
import {
  AzureDevOpsReviewListParams,
  AzureDevOpsReviewPublishParams
} from './azure-devops-review-params'

const pullRequestKey = 'dev.azure.com/contoso+repo+7'

describe('AzureDevOpsReviewPublishParams', () => {
  it('keeps the request of a client that knows no vote', () => {
    expect(AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'] })).toEqual({
      pullRequestKey,
      draftIds: ['d1']
    })
  })

  it.each(AZURE_DEVOPS_REVIEW_CASTABLE_VOTES)('accepts the vote %s with drafts', (vote) => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'], vote }).vote
    ).toBe(vote)
  })

  it('accepts a vote without drafts', () => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: [], vote: 'approved' })
    ).toEqual({ pullRequestKey, draftIds: [], vote: 'approved' })
  })

  it('rejects a request that would publish nothing', () => {
    expect(AzureDevOpsReviewPublishParams.safeParse({ pullRequestKey, draftIds: [] }).success).toBe(
      false
    )
  })

  // Why: a vote this host cannot cast must fail loudly instead of publishing without it.
  it.each(['none', 'reset', 10, null])('rejects the vote %j', (vote) => {
    expect(
      AzureDevOpsReviewPublishParams.safeParse({ pullRequestKey, draftIds: ['d1'], vote }).success
    ).toBe(false)
  })

  // Why pinned: this is how a host from before votes treats `vote`, hence the capability.
  it('drops fields it does not know without an error', () => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'], later: true })
    ).toEqual({ pullRequestKey, draftIds: ['d1'] })
  })
})

describe('AzureDevOpsReviewListParams', () => {
  it.each([undefined, null, {}, { status: 'active' }])(
    'keeps the request %j of a client that knows no pages',
    (params) => {
      expect(AzureDevOpsReviewListParams.parse(params)).toEqual({ status: 'active' })
    }
  )

  it('passes the number of pages a client asks for', () => {
    expect(AzureDevOpsReviewListParams.parse({ status: 'all', pages: 3 })).toEqual({
      status: 'all',
      pages: 3
    })
  })

  // Why accepted: the host clamps, so a client with a larger limit still gets a list.
  it('accepts more pages than this host reads', () => {
    expect(AzureDevOpsReviewListParams.safeParse({ pages: 10_000 }).success).toBe(true)
  })

  it.each([0, -1, 1.5, '2', null])('rejects pages %j', (pages) => {
    expect(AzureDevOpsReviewListParams.safeParse({ pages }).success).toBe(false)
  })

  // Why pinned: a host from before paging parses `pages` like this and answers the first page
  // without `truncatedRepoKeys`, which is why clients offer more only when that field arrives.
  it('drops fields it does not know without an error', () => {
    expect(AzureDevOpsReviewListParams.parse({ status: 'completed', later: 2 })).toEqual({
      status: 'completed'
    })
  })
})
