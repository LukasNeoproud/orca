import { describe, expect, it } from 'vitest'
import {
  contextualFileTargetForMobileLink,
  mobileLinkActionDestination
} from './mobile-link-action-target'

describe('mobileLinkActionDestination', () => {
  it('keeps terminal line and column metadata when copying or inserting a path', () => {
    expect(
      mobileLinkActionDestination({
        source: 'terminal',
        terminalHandle: 'terminal-1',
        kind: 'file',
        pathText: 'src/app.ts',
        line: 12,
        column: 3
      })
    ).toBe('src/app.ts:12:3')
  })

  it('keeps chat citations and web URLs unchanged', () => {
    expect(
      mobileLinkActionDestination({ source: 'chat', kind: 'file', pathText: 'src/app.ts:12' })
    ).toBe('src/app.ts:12')
    expect(
      mobileLinkActionDestination({ source: 'chat', kind: 'web', url: 'https://example.com' })
    ).toBe('https://example.com')
  })

  it('keeps execution-host provenance for contextual preview resolution', () => {
    expect(
      contextualFileTargetForMobileLink({
        source: 'terminal',
        terminalHandle: 'terminal-1',
        cwd: '/remote/repo/sub',
        kind: 'file',
        pathText: '../report.md',
        line: 7,
        column: 2
      })
    ).toEqual({
      pathText: '../report.md',
      line: 7,
      column: 2,
      terminalHandle: 'terminal-1',
      cwd: '/remote/repo/sub'
    })
    expect(
      contextualFileTargetForMobileLink({
        source: 'chat',
        kind: 'file',
        pathText: '/tmp/report.md:7',
        nativeChatContext: { tabId: 'tab-1', sessionId: 'session-1' }
      })
    ).toEqual({
      pathText: '/tmp/report.md:7',
      line: null,
      column: null,
      nativeChatContext: { tabId: 'tab-1', sessionId: 'session-1' }
    })
  })
})
