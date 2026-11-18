import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'
import type { NotificationDispatchRequest } from '../../../shared/notification-settings-types'

const { deliverMock, awayMock } = vi.hoisted(() => ({
  deliverMock: vi.fn<(request: NotificationDispatchRequest) => void>(),
  awayMock: vi.fn()
}))

vi.mock('@/attention/agent-attention-notification-delivery', () => ({
  deliverAgentAttentionNotification: deliverMock,
  readAgentAttentionNotificationSound: () => ({ customSoundId: 'system', customSoundVolume: null })
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ settings: null }) } }))

import {
  announceNewReviewRequests,
  reviewRequestNotification
} from './azure-devops-review-request-notification'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'

function pullRequest(key: string, pullRequestId = 7): AzureDevOpsReviewPullRequest {
  return {
    key,
    pullRequestId,
    title: 'Add paging',
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: 'org',
    organizationLabel: 'org',
    project: 'proj',
    repository: 'app',
    repositoryId: 'repo',
    repoKey: 'org+repo',
    author: { displayName: 'Ada', uniqueName: null },
    myVote: 'none',
    reviewRequested: true,
    createdAt: '',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: ''
  }
}

const deliveredKeys = (): (string | undefined)[] =>
  deliverMock.mock.calls.map(([request]) => request.reviewRequest?.key)

describe('announceNewReviewRequests', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    // Drains what an earlier case left pending in the module.
    awayMock.mockReset().mockResolvedValue(false)
    vi.stubGlobal('window', { api: { notifications: { getDesktopAwayState: awayMock } } })
    await announceNewReviewRequests([])
    deliverMock.mockReset()
    useAzureDevOpsAutoReview.setState({ announcedKeys: new Set() })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends one notification per pull request, however often it is found again', async () => {
    await announceNewReviewRequests([pullRequest('a'), pullRequest('b', 8)])
    await announceNewReviewRequests([pullRequest('a'), pullRequest('b', 8)])

    expect(deliveredKeys()).toEqual(['a', 'b'])
    expect([...useAzureDevOpsAutoReview.getState().announcedKeys]).toEqual(['a', 'b'])
  })

  it('does not repeat a notification the previous session already spent', async () => {
    useAzureDevOpsAutoReview.setState({ announcedKeys: new Set(['a']) })
    await announceNewReviewRequests([pullRequest('a')])

    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('words the notification like the in-app offer and names what a click opens', () => {
    expect(reviewRequestNotification(pullRequest('org+repo+7'))).toEqual({
      source: 'review-request',
      notificationId: 'review-request:org+repo+7',
      attentionKey: 'review-request:org+repo+7',
      shownInApp: true,
      reviewRequest: {
        key: 'org+repo+7',
        title: 'New pull request !7',
        body: 'Add paging · app · Ada',
        actionLabel: 'Review'
      }
    })
  })

  it('leaves the banner of a fork on even for a focused window, which shows no offer for it', () => {
    const fork = { ...pullRequest('org+repo+7'), isFork: true }
    expect(reviewRequestNotification(fork).shownInApp).toBe(false)
  })

  it('holds the notification while the user is away and sends it once they are back', async () => {
    awayMock.mockResolvedValue(true)
    await announceNewReviewRequests([pullRequest('a')])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(useAzureDevOpsAutoReview.getState().announcedKeys.size).toBe(0)

    awayMock.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deliveredKeys()).toEqual(['a'])

    await vi.advanceTimersByTimeAsync(120_000)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('drops a held notification when the request is answered before the user returns', async () => {
    awayMock.mockResolvedValue(true)
    await announceNewReviewRequests([pullRequest('a')])
    await announceNewReviewRequests([])
    awayMock.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('sends when presence cannot be read', async () => {
    awayMock.mockRejectedValue(new Error('no idle monitor'))
    await announceNewReviewRequests([pullRequest('a')])

    expect(deliveredKeys()).toEqual(['a'])
  })
})
