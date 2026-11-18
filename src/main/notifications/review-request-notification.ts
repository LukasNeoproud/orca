import type { ReviewRequestNotification } from '../../shared/notification-settings-types'

/** Renderer channel a clicked review request notification is delivered on. */
export const REVIEW_REQUEST_OPEN_CHANNEL = 'reviewRequest:open'

const TITLE_MAX_LENGTH = 80
const BODY_MAX_LENGTH = 180
const ACTION_MAX_LENGTH = 40

function clip(value: unknown, maxLength: number): string {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  // Code points, so a cut never leaves half a surrogate pair.
  const points = [...normalized]
  return points.length <= maxLength ? normalized : `${points.slice(0, maxLength - 1).join('')}…`
}

/** The key a click should open, or null when the request carries no usable review. */
export function reviewRequestOpenKey(
  reviewRequest: ReviewRequestNotification | undefined
): string | null {
  // Why checked: the request crosses IPC, so its shape is not guaranteed by the type.
  const key: unknown = reviewRequest?.key
  return typeof key === 'string' && key.length > 0 ? key : null
}

export function buildReviewRequestNotificationOptions(
  reviewRequest: ReviewRequestNotification | undefined
): { title: string; body: string; actions?: { type: 'button'; text: string }[] } {
  const actionLabel = clip(reviewRequest?.actionLabel, ACTION_MAX_LENGTH)
  return {
    title: clip(reviewRequest?.title, TITLE_MAX_LENGTH) || 'New pull request',
    body: clip(reviewRequest?.body, BODY_MAX_LENGTH),
    ...(actionLabel && reviewRequestOpenKey(reviewRequest)
      ? { actions: [{ type: 'button' as const, text: actionLabel }] }
      : {})
  }
}
