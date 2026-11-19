import { describe, expect, it } from 'vitest'
import { checkReviewCodeCitation } from './review-code-citation-match'
import type { ReviewCodeCitation } from './review-finding'

const FILE = [
  'export function total(items: number[]): number {',
  '  let sum = 0',
  '',
  '  for (const item of items) {',
  '    sum += item',
  '  }',
  '  return sum',
  '}',
  ''
]

function cite(startLine: number, endLine: number, quote: string): ReviewCodeCitation {
  return { kind: 'code-citation', filePath: 'src/cart.ts', startLine, endLine, quote }
}

describe('checkReviewCodeCitation', () => {
  it('confirms a quote that is at the cited lines', () => {
    expect(checkReviewCodeCitation(cite(5, 5, '    sum += item'), FILE)).toEqual({
      status: 'confirmed'
    })
  })

  it('ignores indentation, blank lines, line endings and trailing spaces', () => {
    const quote = 'let sum = 0\r\nfor (const   item of items) {  \r\n\tsum += item\r\n'
    expect(checkReviewCodeCitation(cite(2, 5, quote), FILE)).toEqual({ status: 'confirmed' })
  })

  it('confirms a quote of part of the cited lines', () => {
    expect(checkReviewCodeCitation(cite(1, 8, 'sum += item'), FILE)).toEqual({
      status: 'confirmed'
    })
    expect(checkReviewCodeCitation(cite(4, 5, 'of items) {\nsum +='), FILE)).toEqual({
      status: 'confirmed'
    })
  })

  it('confirms a quote found once elsewhere in the file and says where', () => {
    expect(checkReviewCodeCitation(cite(2, 2, 'sum += item'), FILE)).toEqual({
      status: 'confirmed',
      foundAt: { startLine: 5, endLine: 5 }
    })
    expect(
      checkReviewCodeCitation(cite(30, 31, 'for (const item of items) {\n  sum += item'), FILE)
    ).toEqual({ status: 'confirmed', foundAt: { startLine: 4, endLine: 5 } })
  })

  it('refutes a quote that is not at the cited lines and is elsewhere more than once', () => {
    // `sum` is on four lines, so a wrong line number cannot be resolved to one place.
    expect(checkReviewCodeCitation(cite(8, 8, 'sum'), FILE)).toEqual({
      status: 'refuted',
      reason: 'text-mismatch',
      actual: '}'
    })
  })

  it('refutes a quote that is nowhere in the file and returns what the lines hold', () => {
    expect(checkReviewCodeCitation(cite(4, 5, 'sum -= item'), FILE)).toEqual({
      status: 'refuted',
      reason: 'text-mismatch',
      actual: '  for (const item of items) {\n    sum += item'
    })
  })

  it('refutes lines past the end of the file', () => {
    expect(checkReviewCodeCitation(cite(9, 9, 'sum -= item'), FILE)).toEqual({
      status: 'refuted',
      reason: 'lines-out-of-range'
    })
    expect(checkReviewCodeCitation(cite(1, 1, 'anything'), [])).toEqual({
      status: 'refuted',
      reason: 'lines-out-of-range'
    })
  })

  it('refutes a quote without any code in it', () => {
    expect(checkReviewCodeCitation(cite(3, 3, ' \n\t'), FILE).status).toBe('refuted')
  })

  it('does not match across lines that the quote skips', () => {
    expect(checkReviewCodeCitation(cite(2, 7, 'let sum = 0\nreturn sum'), FILE).status).toBe(
      'refuted'
    )
  })

  it('bounds the text it returns for a mismatch', () => {
    const long = Array.from(
      { length: 400 },
      (_, index) => `const value${index} = ${'x'.repeat(40)}`
    )
    const check = checkReviewCodeCitation(cite(1, 400, 'missing'), long)
    expect(check.status === 'refuted' ? (check.actual ?? '').length : -1).toBeLessThanOrEqual(1200)
    expect(
      check.status === 'refuted' ? (check.actual ?? '').split('\n').length : -1
    ).toBeLessThanOrEqual(12)
  })
})
