import { describe, expect, it } from 'vitest'
import {
  deriveReviewFindingCertainty,
  isReviewCodeCitation,
  isReviewFindingCertainty,
  isReviewFindingSeverity,
  REVIEW_CONFIRMED_EVIDENCE_PROVES,
  type ReviewEvidenceCheck,
  type ReviewEvidenceProof
} from './review-finding'

const citation = { kind: 'code-citation' }
const unknown = { kind: 'emulator-recording' }

const CHECKS: Record<string, ReviewEvidenceCheck | null | undefined> = {
  confirmed: { status: 'confirmed' },
  'confirmed elsewhere': { status: 'confirmed', foundAt: { startLine: 4, endLine: 5 } },
  'file missing': { status: 'refuted', reason: 'file-missing' },
  'lines out of range': { status: 'refuted', reason: 'lines-out-of-range' },
  'text mismatch': { status: 'refuted', reason: 'text-mismatch', actual: 'return 1' },
  'unknown kind': { status: 'unchecked', reason: 'unknown-kind' },
  'unreadable file': { status: 'unchecked', reason: 'unreadable-file' },
  'commit not in review': { status: 'unchecked', reason: 'commit-not-in-review' },
  'request limit': { status: 'unchecked', reason: 'request-limit' },
  'request failed': { status: 'unchecked', reason: 'request-failed' },
  'no check (null)': null,
  'no check (absent)': undefined
}

describe('deriveReviewFindingCertainty', () => {
  it('is uncertain without evidence', () => {
    expect(deriveReviewFindingCertainty([], [])).toBe('uncertain')
  })

  it.each([
    ['confirmed', 'likely'],
    ['confirmed elsewhere', 'likely'],
    ['file missing', 'contradicted'],
    ['lines out of range', 'contradicted'],
    ['text mismatch', 'contradicted'],
    ['unknown kind', 'uncertain'],
    ['unreadable file', 'uncertain'],
    ['commit not in review', 'uncertain'],
    ['request limit', 'uncertain'],
    ['request failed', 'uncertain'],
    ['no check (null)', 'uncertain'],
    ['no check (absent)', 'uncertain']
  ])('reads one code citation with check "%s" as %s', (check, certainty) => {
    expect(deriveReviewFindingCertainty([citation], [CHECKS[check]])).toBe(certainty)
  })

  it.each(Object.keys(CHECKS))(
    'never counts evidence of an unknown kind as proof, whatever its check "%s" says',
    (check) => {
      const refuted = CHECKS[check]?.status === 'refuted'
      expect(deriveReviewFindingCertainty([unknown], [CHECKS[check]])).toBe(
        refuted ? 'contradicted' : 'uncertain'
      )
    }
  )

  it('lets one refuted piece outweigh confirmed ones, in any order', () => {
    const confirmed = CHECKS.confirmed
    const refuted = CHECKS['text mismatch']
    expect(deriveReviewFindingCertainty([citation, citation], [confirmed, refuted])).toBe(
      'contradicted'
    )
    expect(deriveReviewFindingCertainty([citation, citation], [refuted, confirmed])).toBe(
      'contradicted'
    )
  })

  it('is likely when one of several citations is confirmed and none is refuted', () => {
    expect(
      deriveReviewFindingCertainty(
        [unknown, citation, citation],
        [CHECKS['unknown kind'], CHECKS['request failed'], CHECKS.confirmed]
      )
    ).toBe('likely')
  })

  it('treats a check without its evidence as absent', () => {
    expect(deriveReviewFindingCertainty([], [CHECKS['text mismatch']])).toBe('uncertain')
  })

  // Every list of up to three pieces, of every kind and check this build can produce.
  it('matches the rules for every combination and never says verified', () => {
    const pieces = [citation, unknown].flatMap((evidence) =>
      Object.values(CHECKS).map((check) => ({ evidence, check }))
    )
    const lists: (typeof pieces)[] = [[]]
    for (let size = 1; size <= 3; size++) {
      for (const shorter of lists.filter((list) => list.length === size - 1)) {
        for (const piece of pieces) {
          lists.push([...shorter, piece])
        }
      }
    }
    expect(lists.length).toBe(1 + 24 + 24 ** 2 + 24 ** 3)
    for (const list of lists) {
      const expected = list.some((piece) => piece.check?.status === 'refuted')
        ? 'contradicted'
        : list.some((piece) => piece.evidence === citation && piece.check?.status === 'confirmed')
          ? 'likely'
          : 'uncertain'
      const derived = deriveReviewFindingCertainty(
        list.map((piece) => piece.evidence),
        list.map((piece) => piece.check)
      )
      if (derived !== expected) {
        throw new Error(`${JSON.stringify(list)} derived ${derived}, expected ${expected}`)
      }
    }
  })

  it('lets only a run Orca made itself prove a finding', () => {
    expect([...REVIEW_CONFIRMED_EVIDENCE_PROVES]).toEqual([
      ['code-citation', 'likely'],
      ['command-run', 'verified']
    ])
  })

  it('says verified for a confirmed run, and nothing more than its check for any other', () => {
    const run = { kind: 'command-run', source: 'quality-gate', runId: 'r1' }
    expect(deriveReviewFindingCertainty([run], [CHECKS.confirmed])).toBe('verified')
    expect(
      deriveReviewFindingCertainty([citation, run], [CHECKS.confirmed, CHECKS.confirmed])
    ).toBe('verified')
    expect(deriveReviewFindingCertainty([run], [])).toBe('uncertain')
    expect(
      deriveReviewFindingCertainty([run], [{ status: 'unchecked', reason: 'run-passed' }])
    ).toBe('uncertain')
    // A quote the agent made up outweighs the run.
    expect(
      deriveReviewFindingCertainty([run, citation], [CHECKS.confirmed, CHECKS['text mismatch']])
    ).toBe('contradicted')
  })

  // The path a kind produced by Orca itself takes once one exists.
  it('says verified only for a confirmed kind the table marks as proof', () => {
    const proves = new Map<string, ReviewEvidenceProof>([
      ['code-citation', 'likely'],
      ['check-run', 'verified']
    ])
    const run = { kind: 'check-run' }
    const confirmed = CHECKS.confirmed
    expect(deriveReviewFindingCertainty([run], [confirmed], proves)).toBe('verified')
    expect(deriveReviewFindingCertainty([citation, run], [confirmed, confirmed], proves)).toBe(
      'verified'
    )
    expect(deriveReviewFindingCertainty([run, citation], [confirmed, confirmed], proves)).toBe(
      'verified'
    )
    expect(deriveReviewFindingCertainty([run], [CHECKS['request failed']], proves)).toBe(
      'uncertain'
    )
    expect(
      deriveReviewFindingCertainty([run, citation], [confirmed, CHECKS['text mismatch']], proves)
    ).toBe('contradicted')
    // The same evidence proves nothing to a build that does not know the kind.
    expect(deriveReviewFindingCertainty([run], [confirmed])).toBe('uncertain')
  })

  it('does not read a prototype member as a kind', () => {
    expect(deriveReviewFindingCertainty([{ kind: 'constructor' }], [CHECKS.confirmed])).toBe(
      'uncertain'
    )
  })
})

describe('review finding guards', () => {
  it('knows the four severities and nothing else', () => {
    expect(['error', 'warning', 'suggestion', 'nit'].every(isReviewFindingSeverity)).toBe(true)
    expect(['', 'Error', 'critical', null, 1].some(isReviewFindingSeverity)).toBe(false)
  })

  it('knows the four certainties and nothing else', () => {
    expect(
      ['verified', 'likely', 'uncertain', 'contradicted'].every(isReviewFindingCertainty)
    ).toBe(true)
    expect(['', 'proven', undefined].some(isReviewFindingCertainty)).toBe(false)
  })

  it('accepts a code citation only with every field in place', () => {
    const complete = {
      kind: 'code-citation',
      filePath: 'src/cart.ts',
      startLine: 3,
      endLine: 4,
      quote: 'sum += item'
    }
    expect(isReviewCodeCitation(complete)).toBe(true)
    expect(isReviewCodeCitation({ ...complete, note: 'adds a negative price' })).toBe(true)
    expect(isReviewCodeCitation({ ...complete, kind: 'check-run' })).toBe(false)
    expect(isReviewCodeCitation({ ...complete, endLine: 2 })).toBe(false)
    expect(isReviewCodeCitation({ ...complete, startLine: 0 })).toBe(false)
    expect(isReviewCodeCitation({ ...complete, quote: 7 })).toBe(false)
    expect(isReviewCodeCitation({ ...complete, note: 7 })).toBe(false)
    expect(isReviewCodeCitation({ kind: 'code-citation' })).toBe(false)
  })
})
