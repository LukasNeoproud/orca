import { describe, expect, it } from 'vitest'
import {
  azureDevOpsLastVersionAt,
  deriveAzureDevOpsPullRequestActivity
} from './azure-devops-pull-request-activity'
import type { RawReviewThread } from './azure-devops-review-mappers'

const ME = { id: 'ME-ID' }
const ADA = { id: 'ada-id' }
const READ_AT = '2026-11-20T12:00:00.000Z'

function thread(overrides: Partial<RawReviewThread>): RawReviewThread {
  return { id: 1, status: 'active', ...overrides }
}

function derive(threads: RawReviewThread[]) {
  return deriveAzureDevOpsPullRequestActivity({
    threads,
    lastVersionAt: null,
    meId: 'me-id',
    readAt: READ_AT
  })
}

describe('deriveAzureDevOpsPullRequestActivity', () => {
  it('counts open threads someone else started and dates their last comment', () => {
    const activity = derive([
      thread({
        id: 1,
        status: 'active',
        comments: [
          { id: 1, author: ADA, publishedDate: '2026-11-18T09:00:00Z', commentType: 'text' },
          { id: 2, author: ME, publishedDate: '2026-11-18T10:00:00Z', commentType: 'text' }
        ]
      }),
      thread({
        id: 2,
        status: 'pending',
        comments: [{ id: 1, author: ADA, publishedDate: '2026-11-18T11:00:00Z', commentType: 1 }]
      })
    ])
    expect(activity).toEqual({
      lastVersionAt: null,
      unresolvedThreads: 2,
      lastFeedbackAt: '2026-11-18T11:00:00Z',
      readAt: READ_AT
    })
  })

  it('does not count resolved threads, but their comments are still feedback', () => {
    const activity = derive([
      thread({
        status: 'fixed',
        comments: [{ id: 1, author: ADA, publishedDate: '2026-11-18T09:00:00Z' }]
      }),
      thread({ id: 2, status: 4, comments: [{ id: 1, author: ADA, publishedDate: null }] })
    ])
    expect(activity.unresolvedThreads).toBe(0)
    expect(activity.lastFeedbackAt).toBe('2026-11-18T09:00:00Z')
  })

  it('ignores the threads and comments of the signed-in user', () => {
    const activity = derive([
      thread({
        comments: [
          // The id decides who started the thread, whatever order Azure DevOps returns.
          { id: 2, author: ADA, publishedDate: '2026-11-18T12:00:00Z' },
          { id: 1, author: ME, publishedDate: '2026-11-18T09:00:00Z' }
        ]
      })
    ])
    expect(activity.unresolvedThreads).toBe(0)
    expect(activity.lastFeedbackAt).toBe('2026-11-18T12:00:00Z')
  })

  it('ignores deleted threads, deleted comments and system notices', () => {
    const activity = derive([
      thread({ isDeleted: true, comments: [{ id: 1, author: ADA, publishedDate: '2026-11-19' }] }),
      thread({
        id: 2,
        comments: [{ id: 1, author: ADA, publishedDate: '2026-11-19', isDeleted: true }]
      }),
      thread({
        id: 3,
        comments: [
          { id: 1, author: ADA, publishedDate: '2026-11-19T08:00:00Z', commentType: 'system' }
        ],
        properties: { CodeReviewThreadType: { $value: 'RefUpdate' } }
      })
    ])
    expect(activity).toMatchObject({ unresolvedThreads: 0, lastFeedbackAt: null })
  })

  it('takes a blocking vote of someone else as feedback, an approval not', () => {
    const vote = (id: number, value: string, at: string, author = ADA): RawReviewThread =>
      thread({
        id,
        status: null,
        comments: [{ id: 1, author, publishedDate: at, commentType: 'system' }],
        properties: {
          CodeReviewThreadType: { $value: 'VoteUpdate' },
          CodeReviewVoteResult: { $value: value }
        }
      })
    const activity = derive([
      vote(1, '-5', '2026-11-18T09:00:00Z'),
      vote(2, '10', '2026-11-19T09:00:00Z'),
      vote(3, '-10', '2026-11-20T09:00:00Z', ME)
    ])
    expect(activity).toMatchObject({
      unresolvedThreads: 0,
      lastFeedbackAt: '2026-11-18T09:00:00Z'
    })
  })
})

describe('azureDevOpsLastVersionAt', () => {
  it('is the date of the newest iteration', () => {
    expect(
      azureDevOpsLastVersionAt([
        { id: 1, createdDate: '2026-11-17T09:00:00Z' },
        { id: 3, createdDate: '2026-11-19T09:00:00Z' },
        { id: 2, createdDate: '2026-11-18T09:00:00Z' }
      ])
    ).toBe('2026-11-19T09:00:00Z')
  })

  it('is unknown when no iteration is dated', () => {
    expect(azureDevOpsLastVersionAt([{ id: 1 }, { id: 2, createdDate: 'soon' }])).toBeNull()
  })
})
