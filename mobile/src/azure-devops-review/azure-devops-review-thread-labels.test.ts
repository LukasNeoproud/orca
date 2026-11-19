import { describe, expect, it } from 'vitest'
import {
  reviewThreadLocationLabel,
  reviewThreadOriginNote,
  reviewThreadStateLabel
} from './azure-devops-review-thread-labels'

const base = { status: 'active' as const, filePath: 'src/cart.ts', anchor: null }

describe('review thread labels', () => {
  it('reads a thread from an older host as before', () => {
    const anchored = { ...base, anchor: { side: 'right' as const, startLine: 9, endLine: 9 } }
    expect(reviewThreadLocationLabel(anchored)).toBe('src/cart.ts:9')
    expect(reviewThreadLocationLabel(base)).toBe('src/cart.ts')
    expect(reviewThreadLocationLabel({ ...base, filePath: null })).toBe('General comment')
    expect(reviewThreadStateLabel(anchored)).toBe('active')
    expect(reviewThreadOriginNote(anchored)).toBeNull()
  })

  it('marks an outdated thread and says where it was once its lines are gone', () => {
    const gone = {
      ...base,
      outdated: true,
      originalAnchor: { side: 'right' as const, startLine: 6, endLine: 6 },
      iterationId: 1
    }
    expect(reviewThreadStateLabel(gone)).toBe('active · outdated')
    expect(reviewThreadLocationLabel(gone)).toBe('src/cart.ts · was line 6 of iteration 1')
    const rewritten = { ...gone, anchor: { side: 'right' as const, startLine: 7, endLine: 7 } }
    expect(reviewThreadLocationLabel(rewritten)).toBe('src/cart.ts:7')
  })

  it('does not call a moved thread outdated', () => {
    const moved = {
      ...base,
      anchor: { side: 'right' as const, startLine: 9, endLine: 9 },
      originalAnchor: { side: 'right' as const, startLine: 6, endLine: 6 },
      iterationId: 1
    }
    expect(reviewThreadStateLabel(moved)).toBe('active')
    expect(reviewThreadOriginNote(moved)).toBeNull()
  })
})
