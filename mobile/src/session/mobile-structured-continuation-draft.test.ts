import { afterEach, describe, expect, it } from 'vitest'
import {
  clearMobileStructuredLaunchDraft,
  readMobileStructuredLaunchDraft,
  stageMobileStructuredLaunchDraft
} from './mobile-structured-launch-drafts'
import { stageMobileStructuredContinuationDraft } from './mobile-structured-continuation-draft'

const HOST = 'host-1'
const SESSION = 'codex-copy-1'

afterEach(() => clearMobileStructuredLaunchDraft(HOST, SESSION))

describe('structured continuation draft transfer', () => {
  it('copies the typed message into a new conversation', () => {
    stageMobileStructuredContinuationDraft(HOST, SESSION, 'Review the fix')
    expect(readMobileStructuredLaunchDraft(HOST, SESSION)?.text).toBe('Review the fix')
  })

  it('appends the typed message after a prepared reference without sending either', () => {
    stageMobileStructuredLaunchDraft({
      hostId: HOST,
      sessionId: SESSION,
      text: 'Reference: old thread'
    })
    stageMobileStructuredContinuationDraft(HOST, SESSION, 'Review the fix')
    expect(readMobileStructuredLaunchDraft(HOST, SESSION)?.text).toBe(
      'Reference: old thread\n\nReview the fix'
    )
  })

  it('keeps a prepared reference when the source composer is empty', () => {
    stageMobileStructuredLaunchDraft({ hostId: HOST, sessionId: SESSION, text: 'Reference only' })
    stageMobileStructuredContinuationDraft(HOST, SESSION, '  ')
    expect(readMobileStructuredLaunchDraft(HOST, SESSION)?.text).toBe('Reference only')
  })
})
