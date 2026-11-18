import { describe, expect, it } from 'vitest'
import { buildDiffEditorEmptyOriginalOptions } from './diff-editor-empty-original-options'

describe('buildDiffEditorEmptyOriginalOptions', () => {
  it('leaves Monaco defaults alone unless a caller opts in', () => {
    expect(buildDiffEditorEmptyOriginalOptions(undefined, '')).toEqual({})
    expect(buildDiffEditorEmptyOriginalOptions(false, '')).toEqual({})
  })

  it('renders an empty original without the removed blank line', () => {
    expect(buildDiffEditorEmptyOriginalOptions(true, '')).toEqual({
      experimental: { useTrueInlineView: true }
    })
  })

  it('keeps removed-line zones for an original with text', () => {
    expect(buildDiffEditorEmptyOriginalOptions(true, 'let sum = 0\n')).toEqual({
      experimental: { useTrueInlineView: false }
    })
  })
})
