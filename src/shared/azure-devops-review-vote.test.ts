import { describe, expect, it } from 'vitest'
import {
  AZURE_DEVOPS_REVIEW_CASTABLE_VOTES,
  azureDevOpsReviewVoteObstacle,
  azureDevOpsReviewVoteToWire,
  isAzureDevOpsReviewCastableVote
} from './azure-devops-review-vote'

describe('azureDevOpsReviewVoteToWire', () => {
  it('maps every castable vote to the number Azure DevOps stores', () => {
    expect(
      AZURE_DEVOPS_REVIEW_CASTABLE_VOTES.map((vote) => [vote, azureDevOpsReviewVoteToWire(vote)])
    ).toEqual([
      ['approved', 10],
      ['approved-with-suggestions', 5],
      ['waiting-for-author', -5],
      ['rejected', -10]
    ])
  })
})

describe('isAzureDevOpsReviewCastableVote', () => {
  it('leaves out withdrawing a vote and anything unknown', () => {
    expect(isAzureDevOpsReviewCastableVote('approved')).toBe(true)
    expect(isAzureDevOpsReviewCastableVote('none')).toBe(false)
    expect(isAzureDevOpsReviewCastableVote('keep')).toBe(false)
    expect(isAzureDevOpsReviewCastableVote(10)).toBe(false)
  })
})

describe('azureDevOpsReviewVoteObstacle', () => {
  it("allows a vote on someone else's open pull request", () => {
    expect(azureDevOpsReviewVoteObstacle({ status: 'active' })).toBeNull()
  })

  it('names the reason on an own or closed pull request', () => {
    expect(azureDevOpsReviewVoteObstacle({ status: 'active', createdByMe: true })).toBe('own')
    expect(azureDevOpsReviewVoteObstacle({ status: 'completed' })).toBe('closed')
    expect(azureDevOpsReviewVoteObstacle({ status: 'abandoned' })).toBe('closed')
  })
})
