import { describe, expect, it } from 'vitest'
import {
  buildReviewRequestNotificationOptions,
  reviewRequestOpenKey
} from './review-request-notification'

describe('buildReviewRequestNotificationOptions', () => {
  it('uses the sender wording and offers a button that opens the review', () => {
    expect(
      buildReviewRequestNotificationOptions({
        key: 'org+repo+7',
        title: 'New pull request !7',
        body: 'Add  paging\n· app · Ada',
        actionLabel: 'Review'
      })
    ).toEqual({
      title: 'New pull request !7',
      body: 'Add paging · app · Ada',
      actions: [{ type: 'button', text: 'Review' }]
    })
  })

  it('clips long text without splitting a surrogate pair', () => {
    const options = buildReviewRequestNotificationOptions({
      key: 'k',
      title: 'T',
      body: `${'a'.repeat(178)}😀😀😀`
    })
    expect([...options.body]).toHaveLength(180)
    expect(options.body.endsWith('😀…')).toBe(true)
    expect(options.actions).toBeUndefined()
  })

  it('still names the event when the request carries no review', () => {
    expect(buildReviewRequestNotificationOptions(undefined)).toEqual({
      title: 'New pull request',
      body: ''
    })
  })
})

describe('reviewRequestOpenKey', () => {
  it('rejects a missing or empty key', () => {
    expect(reviewRequestOpenKey({ key: 'org+repo+7', title: '', body: '' })).toBe('org+repo+7')
    expect(reviewRequestOpenKey({ key: '', title: '', body: '' })).toBeNull()
    expect(reviewRequestOpenKey(undefined)).toBeNull()
  })
})
