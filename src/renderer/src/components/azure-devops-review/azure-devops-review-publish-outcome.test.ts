import { describe, expect, it } from 'vitest'
import { summarizeAzureDevOpsReviewPublish } from './azure-devops-review-publish-outcome'

const ok = (draftId: string) => ({ draftId, ok: true, error: null })
const failed = (draftId: string) => ({ draftId, ok: false, error: 'HTTP 500' })

describe('summarizeAzureDevOpsReviewPublish', () => {
  it('is complete when the comments and the vote went out', () => {
    expect(
      summarizeAzureDevOpsReviewPublish(
        { results: [ok('d1'), ok('d2')], vote: { vote: 'approved', status: 'sent', error: null } },
        'approved'
      )
    ).toEqual({
      commentsPosted: 2,
      commentsFailed: 0,
      vote: 'sent',
      voteError: null,
      complete: true
    })
  })

  it('is complete without a vote when none was asked for', () => {
    expect(summarizeAzureDevOpsReviewPublish({ results: [ok('d1')] }, null)).toMatchObject({
      vote: 'not-requested',
      complete: true
    })
  })

  it('reports a vote held back by a failed comment', () => {
    expect(
      summarizeAzureDevOpsReviewPublish(
        {
          results: [ok('d1'), failed('d2')],
          vote: { vote: 'rejected', status: 'skipped', error: null }
        },
        'rejected'
      )
    ).toEqual({
      commentsPosted: 1,
      commentsFailed: 1,
      vote: 'skipped',
      voteError: null,
      complete: false
    })
  })

  it('reports a vote Azure DevOps refused, with its reason', () => {
    expect(
      summarizeAzureDevOpsReviewPublish(
        { results: [ok('d1')], vote: { vote: 'approved', status: 'failed', error: 'Forbidden' } },
        'approved'
      )
    ).toMatchObject({ commentsPosted: 1, vote: 'failed', voteError: 'Forbidden', complete: false })
  })

  it('treats a host that says nothing about the vote as not having sent it', () => {
    expect(summarizeAzureDevOpsReviewPublish({ results: [ok('d1')] }, 'approved')).toMatchObject({
      commentsPosted: 1,
      vote: 'unacknowledged',
      complete: false
    })
  })

  it('does not take an answer about another vote for the one asked for', () => {
    expect(
      summarizeAzureDevOpsReviewPublish(
        { results: [], vote: { vote: 'rejected', status: 'sent', error: null } },
        'approved'
      )
    ).toMatchObject({ vote: 'unacknowledged', complete: false })
  })
})
