import { describe, expect, it } from 'vitest'
import { azureDevOpsReviewDiffExcerpt } from './azure-devops-review-diff-excerpt'
import { azureDevOpsReviewInlineItems } from './azure-devops-review-inline-items'
import type { MobileDiffLine } from '../session/mobile-diff-lines'

function context(count: number, start: number): MobileDiffLine[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'context' as const,
    text: `line ${start + index}`,
    oldLineNumber: start + index,
    newLineNumber: start + index
  }))
}

const shape = (rows: ReturnType<typeof azureDevOpsReviewDiffExcerpt>) =>
  rows.map((row) => (row.kind === 'gap' ? `gap ${row.hiddenLines}` : row.line.text))

describe('azureDevOpsReviewDiffExcerpt', () => {
  const lines: MobileDiffLine[] = [
    ...context(10, 1),
    { kind: 'add', text: 'new', newLineNumber: 11 },
    ...context(10, 11).map((line) => ({ ...line, newLineNumber: line.newLineNumber! + 1 }))
  ]

  it('keeps three lines of context around a change and collapses the rest', () => {
    expect(shape(azureDevOpsReviewDiffExcerpt(lines))).toEqual([
      'gap 7',
      'line 8',
      'line 9',
      'line 10',
      'new',
      'line 11',
      'line 12',
      'line 13',
      'gap 7'
    ])
  })

  it('keeps an unchanged line that carries a comment', () => {
    expect(shape(azureDevOpsReviewDiffExcerpt(lines, new Set(['right:2'])))[0]).toBe('line 1')
  })
})

describe('azureDevOpsReviewInlineItems', () => {
  it('groups threads and unpublished drafts of a file under their last line', () => {
    const anchor = { side: 'right' as const, startLine: 3, endLine: 4 }
    const thread = { id: 1, filePath: 'a.ts', anchor }
    const draft = (state: 'draft' | 'published', filePath: string) => ({
      id: state + filePath,
      kind: 'inline' as const,
      state,
      filePath,
      anchor
    })
    const items = azureDevOpsReviewInlineItems(
      {
        threads: [thread],
        drafts: [draft('draft', 'a.ts'), draft('published', 'a.ts'), draft('draft', 'b.ts')]
      },
      'a.ts'
    )
    expect([...items.keys()]).toEqual(['right:4'])
    expect(items.get('right:4')?.threads).toEqual([thread])
    expect(items.get('right:4')?.drafts.map((d) => d.id)).toEqual(['drafta.ts'])
  })
})
