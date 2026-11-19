import { describe, expect, it } from 'vitest'
import {
  threadLocationLabel,
  threadOriginLabel,
  threadStateLabel
} from './azure-devops-review-labels'

describe('thread labels', () => {
  it('names the lines of the latest iteration', () => {
    const anchor = { side: 'right' as const, startLine: 9, endLine: 11 }
    expect(threadLocationLabel({ filePath: 'src/a.ts', anchor })).toBe('src/a.ts:9–11')
    expect(threadLocationLabel({ filePath: 'src/a.ts', anchor: null })).toBe('src/a.ts')
    expect(threadLocationLabel({ filePath: null, anchor: null })).toBeNull()
  })

  it('says where an outdated thread was written', () => {
    const originalAnchor = { side: 'right' as const, startLine: 3, endLine: 4 }
    expect(threadOriginLabel({ outdated: true, originalAnchor, iterationId: 1 })).toBe(
      'was L3–4 in iteration 1'
    )
    expect(threadStateLabel({ status: 'fixed', outdated: true })).toBe('Resolved · Outdated')
  })

  it('adds nothing to a thread that only moved', () => {
    const originalAnchor = { side: 'right' as const, startLine: 3, endLine: 3 }
    expect(threadOriginLabel({ originalAnchor, iterationId: 1 })).toBeNull()
    expect(threadStateLabel({ status: 'active' })).toBe('Active')
  })
})
