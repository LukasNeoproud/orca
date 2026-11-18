import {
  deliverAgentAttentionNotification,
  readAgentAttentionNotificationSound
} from '@/attention/agent-attention-notification-delivery'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import type { NotificationDispatchRequest } from '../../../shared/notification-settings-types'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

const AWAY_RETRY_MS = 30_000

/** Review requests still owed their system notification, held while the user is away. */
const pending = new Map<string, AzureDevOpsReviewPullRequest>()
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function reviewRequestNotification(
  pullRequest: AzureDevOpsReviewPullRequest
): NotificationDispatchRequest {
  const id = `review-request:${pullRequest.key}`
  return {
    source: 'review-request',
    notificationId: id,
    // Why: two requests found by one check are separate news, not one burst.
    attentionKey: id,
    // A fork gets no in-app AI review offer, so its banner is the only announcement.
    shownInApp: !pullRequest.isFork,
    reviewRequest: {
      key: pullRequest.key,
      title: translate('azureDevOpsReview.autoReviewOffer', 'New pull request !{{value0}}', {
        value0: pullRequest.pullRequestId
      }),
      body: `${pullRequest.title} · ${pullRequest.repository} · ${pullRequest.author.displayName}`,
      actionLabel: translate('azureDevOpsReview.autoReviewAccept', 'Review')
    }
  }
}

async function isDesktopAway(): Promise<boolean> {
  try {
    return (await window.api.notifications.getDesktopAwayState()) === true
  } catch {
    // Unknown presence must not swallow the notification.
    return false
  }
}

async function sendPending(): Promise<void> {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (pending.size === 0) {
    return
  }
  // Why: each pull request gets one notification, so it waits for someone to see it.
  if (await isDesktopAway()) {
    if (retryTimer === null && pending.size > 0) {
      retryTimer = setTimeout(() => void sendPending(), AWAY_RETRY_MS)
    }
    return
  }
  const batch = [...pending.values()]
  pending.clear()
  // Why first: a failed or interrupted send must not repeat after a restart.
  useAzureDevOpsAutoReview.getState().markAnnounced(batch.map((pullRequest) => pullRequest.key))
  const sound = readAgentAttentionNotificationSound(useAppStore.getState().settings ?? {})
  for (const pullRequest of batch) {
    deliverAgentAttentionNotification(reviewRequestNotification(pullRequest), sound)
  }
}

/**
 * Sends one system notification per review request not announced yet. `newRequests` is the whole
 * current set, so a request answered or closed while the user was away is dropped unannounced.
 */
export function announceNewReviewRequests(
  newRequests: readonly AzureDevOpsReviewPullRequest[]
): Promise<void> {
  const { announcedKeys } = useAzureDevOpsAutoReview.getState()
  pending.clear()
  for (const pullRequest of newRequests) {
    if (!announcedKeys.has(pullRequest.key)) {
      pending.set(pullRequest.key, pullRequest)
    }
  }
  return sendPending()
}
