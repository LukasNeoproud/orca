import { describe, expect, it } from 'vitest'
import {
  clearMobileStructuredLaunchDraft,
  readMobileStructuredLaunchDraft,
  resolveMobileChatLaunchDraft,
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

  it('seeds a structured chat from staged context until the host lists its own draft', () => {
    stageMobileStructuredLaunchDraft({
      hostId: 'h',
      sessionId: 'codex_next',
      text: 'Reference: /context/source.md',
      createdAt: 9
    })

    expect(resolveMobileChatLaunchDraft('h', 'codex_next', null)).toEqual({
      text: 'Reference: /context/source.md',
      createdAt: 9
    })
    expect(
      resolveMobileChatLaunchDraft('h', 'codex_next', {
        launchDraft: 'Host draft',
        launchDraftCreatedAt: 12
      })
    ).toEqual({ text: 'Host draft', createdAt: 12 })
    expect(resolveMobileChatLaunchDraft('other', 'codex_next', null)).toEqual({
      text: null,
      createdAt: null
    })
    clearMobileStructuredLaunchDraft('h', 'codex_next')
  })
})
