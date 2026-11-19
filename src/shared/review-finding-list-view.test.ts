import { describe, expect, it } from 'vitest'
import {
  countReviewFindingFilters,
  EMPTY_REVIEW_FINDING_FILTER,
  filterReviewFindings,
  isReviewFindingSortOrder,
  reviewFindingFacets,
  sortReviewFindings,
  type ReviewFindingFilter,
  type ReviewFindingListItem
} from './review-finding-list-view'

type Item = ReviewFindingListItem & { id: string }

let clock = 0
function item(id: string, patch: Partial<ReviewFindingListItem> = {}): Item {
  clock += 1
  return {
    id,
    severity: null,
    certainty: null,
    authorKey: 'agent:claude',
    filePath: 'src/cart.ts',
    line: 1,
    createdAt: clock,
    ...patch
  }
}

const ids = (items: readonly Item[]) => items.map((entry) => entry.id)

// A pull request after an AI review, plus what the reviewer wrote by hand.
const handWritten = item('hand-written', { authorKey: 'user', filePath: null, line: null })
const nit = item('nit', { severity: 'nit', certainty: 'likely', line: 9 })
const errorUncertain = item('error-uncertain', { severity: 'error', certainty: 'uncertain' })
const warningLikely = item('warning-likely', {
  severity: 'warning',
  certainty: 'likely',
  filePath: 'src/tax.ts',
  line: 3
})
const errorContradicted = item('error-contradicted', {
  severity: 'error',
  certainty: 'contradicted',
  line: 20
})
const errorLikely = item('error-likely', {
  severity: 'error',
  certainty: 'likely',
  filePath: 'src/tax.ts',
  line: 7
})
const handWarning = item('hand-warning', {
  severity: 'warning',
  authorKey: 'user',
  filePath: 'src/tax.ts',
  line: 3
})
const replyOnFile = item('reply-on-file', { filePath: 'src/cart.ts', line: null })
const ALL = [
  handWritten,
  nit,
  errorUncertain,
  warningLikely,
  errorContradicted,
  errorLikely,
  handWarning,
  replyOnFile
]

const filter = (patch: Partial<ReviewFindingFilter>): ReviewFindingFilter => ({
  ...EMPTY_REVIEW_FINDING_FILTER,
  ...patch
})

describe('sortReviewFindings', () => {
  it('puts the highest priority first and contradicted findings last', () => {
    expect(ids(sortReviewFindings(ALL, 'priority'))).toEqual([
      'error-likely',
      'error-uncertain',
      'warning-likely',
      'hand-warning',
      'nit',
      'hand-written',
      'reply-on-file',
      'error-contradicted'
    ])
  })

  it('orders by file and line, with comments on no file and on the whole file first', () => {
    expect(ids(sortReviewFindings(ALL, 'file'))).toEqual([
      'hand-written',
      'reply-on-file',
      'error-uncertain',
      'nit',
      'error-contradicted',
      'warning-likely',
      'hand-warning',
      'error-likely'
    ])
  })

  it('follows the order of the change for files it lists and puts the others after them', () => {
    const rank = new Map([
      ['src/tax.ts', 0],
      ['src/cart.ts', 1]
    ])
    const stray = item('stray', { filePath: 'docs/old.md' })

    expect(ids(sortReviewFindings([...ALL, stray], 'file', rank))).toEqual([
      'hand-written',
      'warning-likely',
      'hand-warning',
      'error-likely',
      'reply-on-file',
      'error-uncertain',
      'nit',
      'error-contradicted',
      'stray'
    ])
  })

  it('breaks a tie of priority by file order, so equal findings stay predictable', () => {
    const later = item('later', { severity: 'warning', certainty: 'likely', filePath: 'src/a.ts' })

    expect(ids(sortReviewFindings([warningLikely, later, handWarning], 'priority'))).toEqual([
      'later',
      'warning-likely',
      'hand-warning'
    ])
  })

  it('leaves the input as it was', () => {
    const input = [nit, errorLikely]

    sortReviewFindings(input, 'priority')

    expect(ids(input)).toEqual(['nit', 'error-likely'])
  })
})

describe('filterReviewFindings', () => {
  it('keeps everything without a filter', () => {
    const result = filterReviewFindings(ALL, EMPTY_REVIEW_FINDING_FILTER)

    expect(ids(result.shown)).toEqual(ids(ALL))
    expect(result.hidden).toEqual([])
    expect(countReviewFindingFilters(EMPTY_REVIEW_FINDING_FILTER)).toBe(0)
  })

  it('keeps errors and warnings that are likely, and counts the hidden drafts without severity', () => {
    const chosen = filter({ severities: ['error', 'warning'], certainties: ['likely'] })
    const result = filterReviewFindings(ALL, chosen)

    expect(ids(result.shown)).toEqual(['warning-likely', 'error-likely'])
    expect(result.hidden).toHaveLength(6)
    expect(result.hiddenWithoutSeverity).toBe(2)
    expect(countReviewFindingFilters(chosen)).toBe(2)
  })

  it('matches drafts without a severity or a certainty through the unrated value', () => {
    expect(ids(filterReviewFindings(ALL, filter({ severities: ['none'] })).shown)).toEqual([
      'hand-written',
      'reply-on-file'
    ])
    expect(ids(filterReviewFindings(ALL, filter({ certainties: ['none'] })).shown)).toEqual([
      'hand-written',
      'hand-warning',
      'reply-on-file'
    ])
  })

  it('narrows by author and by file, with null standing for no file', () => {
    expect(ids(filterReviewFindings(ALL, filter({ authorKeys: ['user'] })).shown)).toEqual([
      'hand-written',
      'hand-warning'
    ])
    expect(
      ids(filterReviewFindings(ALL, filter({ filePaths: [null, 'src/tax.ts'] })).shown)
    ).toEqual(['hand-written', 'warning-likely', 'error-likely', 'hand-warning'])
  })
})

describe('reviewFindingFacets', () => {
  it('counts every severity and certainty, and the authors and files present', () => {
    const facets = reviewFindingFacets(ALL, EMPTY_REVIEW_FINDING_FILTER)

    expect(facets.severities).toEqual([
      ['error', 3],
      ['warning', 2],
      ['suggestion', 0],
      ['nit', 1],
      ['none', 2]
    ])
    expect(facets.certainties).toEqual([
      ['verified', 0],
      ['likely', 3],
      ['uncertain', 1],
      ['contradicted', 1],
      ['none', 3]
    ])
    expect(facets.authorKeys).toEqual([
      ['agent:claude', 6],
      ['user', 2]
    ])
    expect(facets.filePaths).toEqual([
      [null, 1],
      ['src/cart.ts', 4],
      ['src/tax.ts', 3]
    ])
  })

  it('keeps listing a value the filter holds after its last finding is gone', () => {
    const facets = reviewFindingFacets(
      [nit],
      filter({ authorKeys: ['agent:codex'], filePaths: ['src/gone.ts'] })
    )

    expect(facets.authorKeys).toEqual([
      ['agent:claude', 1],
      ['agent:codex', 0]
    ])
    expect(facets.filePaths).toEqual([
      ['src/cart.ts', 1],
      ['src/gone.ts', 0]
    ])
  })
})

describe('isReviewFindingSortOrder', () => {
  it('accepts the two orders and nothing else', () => {
    expect(isReviewFindingSortOrder('priority')).toBe(true)
    expect(isReviewFindingSortOrder('file')).toBe(true)
    expect(isReviewFindingSortOrder('severity')).toBe(false)
    expect(isReviewFindingSortOrder(null)).toBe(false)
  })
})
