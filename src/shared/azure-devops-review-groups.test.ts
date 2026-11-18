import { describe, expect, it } from 'vitest'
import {
  groupByReviewInvolvement,
  isReviewInvolvementFilter,
  reviewInvolvementOf,
  reviewRowAction
} from './azure-devops-review-groups'
import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

type Fields = Pick<
  AzureDevOpsReviewPullRequest,
  'key' | 'status' | 'isDraft' | 'createdByMe' | 'reviewRequested' | 'myVote'
>

function pr(key: string, patch: Partial<Fields> = {}): Fields {
  return { key, status: 'active', isDraft: false, myVote: 'none', ...patch }
}

describe('reviewInvolvementOf', () => {
  it('waits for my review only while I am asked and have not voted', () => {
    expect(reviewInvolvementOf(pr('asked', { reviewRequested: true }))).toBe('awaiting-my-review')
    expect(reviewInvolvementOf(pr('approved', { reviewRequested: true, myVote: 'approved' }))).toBe(
      'other'
    )
    expect(
      reviewInvolvementOf(pr('waiting', { reviewRequested: true, myVote: 'waiting-for-author' }))
    ).toBe('other')
  })

  it('does not wait for me on a draft, a closed or a group-only request', () => {
    expect(reviewInvolvementOf(pr('draft', { reviewRequested: true, isDraft: true }))).toBe('other')
    expect(reviewInvolvementOf(pr('merged', { reviewRequested: true, status: 'completed' }))).toBe(
      'other'
    )
    // A host older than `reviewRequested` leaves the field out.
    expect(reviewInvolvementOf(pr('group-only'))).toBe('other')
  })

  it('keeps my own pull request mine in every state', () => {
    expect(reviewInvolvementOf(pr('mine', { createdByMe: true, reviewRequested: true }))).toBe(
      'mine'
    )
    expect(reviewInvolvementOf(pr('mine-merged', { createdByMe: true, status: 'completed' }))).toBe(
      'mine'
    )
  })
})

describe('groupByReviewInvolvement', () => {
  it('puts every pull request into exactly one group and keeps the list order', () => {
    const groups = groupByReviewInvolvement([
      pr('other-1'),
      pr('asked-1', { reviewRequested: true }),
      pr('mine-1', { createdByMe: true }),
      pr('asked-2', { reviewRequested: true }),
      pr('other-2', { reviewRequested: true, myVote: 'rejected' })
    ])
    expect(groups['awaiting-my-review'].map((entry) => entry.key)).toEqual(['asked-1', 'asked-2'])
    expect(groups.mine.map((entry) => entry.key)).toEqual(['mine-1'])
    expect(groups.other.map((entry) => entry.key)).toEqual(['other-1', 'other-2'])
  })
})

describe('reviewRowAction', () => {
  it('starts a review on a request with no drafts and continues one that has drafts', () => {
    const asked = pr('asked', { reviewRequested: true })
    expect(reviewRowAction(asked, 0)).toBe('start-review')
    expect(reviewRowAction(asked, 2)).toBe('continue-review')
  })

  it('continues wherever drafts are left, and offers nothing otherwise', () => {
    expect(reviewRowAction(pr('voted', { reviewRequested: true, myVote: 'approved' }), 1)).toBe(
      'continue-review'
    )
    expect(
      reviewRowAction(pr('voted', { reviewRequested: true, myVote: 'approved' }), 0)
    ).toBeNull()
    expect(reviewRowAction(pr('mine', { createdByMe: true }), 0)).toBeNull()
    expect(reviewRowAction(pr('bystander'), 0)).toBeNull()
  })

  it('offers nothing on a closed pull request, even with drafts left', () => {
    expect(reviewRowAction(pr('merged', { reviewRequested: true, status: 'completed' }), 3)).toBe(
      null
    )
  })
})

describe('isReviewInvolvementFilter', () => {
  it('accepts the stored choices and rejects anything else', () => {
    expect(['all', 'awaiting-my-review', 'mine'].every(isReviewInvolvementFilter)).toBe(true)
    expect(isReviewInvolvementFilter('other')).toBe(false)
    expect(isReviewInvolvementFilter(undefined)).toBe(false)
  })
})
