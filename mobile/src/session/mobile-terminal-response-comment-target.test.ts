import { describe, expect, it } from 'vitest'
import { isMobileTerminalResponseCommentTargetActive } from './mobile-terminal-response-comment-target'

describe('isMobileTerminalResponseCommentTargetActive', () => {
  it('accepts only the terminal that owns the selection', () => {
    expect(isMobileTerminalResponseCommentTargetActive('term-a', 'term-a', 'terminal')).toBe(true)
    expect(isMobileTerminalResponseCommentTargetActive('term-a', 'term-b', 'terminal')).toBe(false)
    expect(isMobileTerminalResponseCommentTargetActive('term-a', 'term-a', 'artifact')).toBe(false)
  })
})
