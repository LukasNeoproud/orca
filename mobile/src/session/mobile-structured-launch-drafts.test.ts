import { describe, expect, it } from 'vitest'
import {
  clearMobileStructuredLaunchDraft,
  readMobileStructuredLaunchDraft,
  stageMobileStructuredLaunchDraft
} from './mobile-structured-launch-drafts'

describe('mobile structured launch drafts', () => {
  it('keeps continuation context scoped to the owning host and intended session', () => {
    stageMobileStructuredLaunchDraft({
      hostId: 'host-a',
      sessionId: 'codex_next',
      text: 'Reference: /context.md',
      createdAt: 7
    })

    expect(readMobileStructuredLaunchDraft('host-a', 'codex_next')).toEqual({
      text: 'Reference: /context.md',
      createdAt: 7
    })
    expect(readMobileStructuredLaunchDraft('host-b', 'codex_next')).toBeNull()
    expect(readMobileStructuredLaunchDraft('host-a', 'codex_other')).toBeNull()

    clearMobileStructuredLaunchDraft('host-a', 'codex_next')
    expect(readMobileStructuredLaunchDraft('host-a', 'codex_next')).toBeNull()
  })
})
