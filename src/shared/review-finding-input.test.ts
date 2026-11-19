import { describe, expect, it } from 'vitest'
import {
  parseReviewFindingEvidence,
  parseReviewFindingSeverity,
  readStoredReviewFindingEvidence,
  REVIEW_FINDING_LIMITS
} from './review-finding-input'

const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 5,
  quote: 'sum += item'
}
const keep = { unknownKinds: 'keep' } as const
const reject = { unknownKinds: 'reject' } as const

function errorOf(input: unknown, options: typeof keep | typeof reject = reject): string {
  const parsed = parseReviewFindingEvidence(input, options)
  return parsed.ok ? '' : parsed.error
}

describe('parseReviewFindingSeverity', () => {
  it.each(['error', 'warning', 'suggestion', 'nit'])('accepts %s', (severity) => {
    expect(parseReviewFindingSeverity(severity)).toEqual({ ok: true, value: severity })
  })

  it.each(['critical', 'Error', '', 3, null, undefined])('names the values for %j', (severity) => {
    expect(parseReviewFindingSeverity(severity)).toEqual({
      ok: false,
      error: 'severity must be one of error, warning, suggestion, nit'
    })
  })
})

describe('parseReviewFindingEvidence', () => {
  it('normalizes a code citation', () => {
    expect(
      parseReviewFindingEvidence(
        [
          {
            kind: ' code-citation ',
            filePath: '/src/cart.ts ',
            startLine: 4,
            quote: '\r\n    sum += item\r\n  }\r\n\r\n',
            note: '  adds a negative price  ',
            check: { status: 'confirmed' },
            origin: 'orca',
            extra: true
          }
        ],
        reject
      )
    ).toEqual({
      ok: true,
      value: [
        {
          kind: 'code-citation',
          filePath: 'src/cart.ts',
          startLine: 4,
          endLine: 4,
          quote: '    sum += item\n  }',
          note: 'adds a negative price'
        }
      ]
    })
  })

  it('accepts an empty list', () => {
    expect(parseReviewFindingEvidence([], reject)).toEqual({ ok: true, value: [] })
  })

  it.each<[string, unknown]>([
    ['evidence must be a list', {}],
    ['evidence must be a list', '[]'],
    ['evidence[0] must be an object with a kind, such as code-citation', [null]],
    ['evidence[0] must be an object with a kind, such as code-citation', [{ filePath: 'a.ts' }]],
    [
      'evidence[1].filePath must be a repository-relative file path',
      [citation, { ...citation, filePath: '' }]
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      [{ ...citation, filePath: '../secrets.txt' }]
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      [{ ...citation, filePath: 'src/../../x' }]
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      [{ ...citation, filePath: 'src\\cart.ts' }]
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      [{ ...citation, filePath: 'src/a\u0000b' }]
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      [{ ...citation, filePath: 'a'.repeat(1025) }]
    ],
    [
      'evidence[0].startLine must be a line number, counted from 1',
      [{ ...citation, startLine: 0 }]
    ],
    [
      'evidence[0].startLine must be a line number, counted from 1',
      [{ ...citation, startLine: '4' }]
    ],
    [
      'evidence[0].startLine must be a line number, counted from 1',
      [{ ...citation, startLine: 1.5 }]
    ],
    [
      'evidence[0].endLine must be a line number that is not before startLine',
      [{ ...citation, endLine: 3 }]
    ],
    ['evidence[0] cites more than 400 lines; cite less', [{ ...citation, endLine: 404 }]],
    [
      'evidence[0].quote must hold the cited lines as they are in the file',
      [{ ...citation, quote: '  \n' }]
    ],
    [
      'evidence[0].quote must hold the cited lines as they are in the file',
      [{ ...citation, quote: undefined }]
    ],
    [
      'evidence[0].quote is longer than 4000 characters',
      [{ ...citation, quote: 'x'.repeat(4001) }]
    ],
    ['evidence[0].note must be text', [{ ...citation, note: 5 }]],
    ['evidence[0].note is longer than 500 characters', [{ ...citation, note: 'n'.repeat(501) }]],
    ['evidence[0].kind must be code-citation', [{ kind: 'test-run', command: 'pnpm test' }]]
  ])('says "%s"', (error, input) => {
    expect(errorOf(input)).toBe(error)
  })

  it('rejects more items than the limit', () => {
    const many = Array.from({ length: REVIEW_FINDING_LIMITS.evidenceItems + 1 }, () => citation)
    expect(errorOf(many)).toBe('evidence holds more than 10 items')
    expect(parseReviewFindingEvidence(many.slice(1), reject).ok).toBe(true)
  })

  it('keeps a kind from a newer peer as sent, without the fields only a host writes', () => {
    const parsed = parseReviewFindingEvidence(
      [
        {
          kind: 'emulator-recording',
          screen: 'Checkout',
          steps: [{ tap: 'Pay' }],
          origin: 'orca',
          check: { status: 'confirmed' }
        }
      ],
      keep
    )
    expect(parsed).toEqual({
      ok: true,
      value: [{ kind: 'emulator-recording', screen: 'Checkout', steps: [{ tap: 'Pay' }] }]
    })
  })

  it('bounds what it keeps of an unknown kind', () => {
    expect(errorOf([{ kind: 'k'.repeat(65) }], keep)).toBe('evidence[0].kind must be code-citation')
    expect(errorOf([{ kind: 'blob', data: 'x'.repeat(4000) }], keep)).toBe(
      'evidence[0] is larger than 4000 characters'
    )
  })

  it('does not let an unknown kind replace the prototype of what it keeps', () => {
    const parsed = parseReviewFindingEvidence(
      [JSON.parse('{"kind":"later","__proto__":{"origin":"orca"}}')],
      keep
    )
    expect(parsed).toEqual({ ok: true, value: [{ kind: 'later' }] })
    expect(parsed.ok && 'origin' in parsed.value[0]).toBe(false)
  })

  it('still validates a code citation when unknown kinds are kept', () => {
    expect(errorOf([{ ...citation, startLine: -1 }], keep)).toContain('evidence[0].startLine')
  })
})

describe('readStoredReviewFindingEvidence', () => {
  it('reads what a host stored and keeps the fields of a newer host', () => {
    expect(
      readStoredReviewFindingEvidence([
        citation,
        { kind: 'check-run', origin: 'orca', command: 'pnpm test', exitCode: 1 }
      ])
    ).toEqual([citation, { kind: 'check-run', origin: 'orca', command: 'pnpm test', exitCode: 1 }])
  })

  it('drops what it cannot read instead of failing', () => {
    expect(
      readStoredReviewFindingEvidence([null, 'text', { ...citation, startLine: 'x' }, citation])
    ).toEqual([citation])
    expect(readStoredReviewFindingEvidence('nothing')).toEqual([])
    expect(readStoredReviewFindingEvidence(undefined)).toEqual([])
  })

  it('reads at most the allowed number of items', () => {
    expect(
      readStoredReviewFindingEvidence(Array.from({ length: 30 }, () => citation))
    ).toHaveLength(10)
  })
})
