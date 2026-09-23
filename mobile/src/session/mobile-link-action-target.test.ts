import { describe, expect, it } from 'vitest'
import { mobileLinkActionDestination } from './mobile-link-action-target'

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
})
