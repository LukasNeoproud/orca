import { describe, expect, it } from 'vitest'
import {
  REVIEW_FINDING_CERTAINTIES,
  REVIEW_FINDING_SEVERITIES,
  type ReviewFindingCertainty,
  type ReviewFindingSeverity
} from './review-finding'
import { deriveReviewFindingPriority } from './review-finding-priority'

// Most serious first; null is a draft nobody gave a severity.
const SEVERITIES: (ReviewFindingSeverity | null)[] = [...REVIEW_FINDING_SEVERITIES, null]
const CERTAINTIES: (ReviewFindingCertainty | null)[] = [...REVIEW_FINDING_CERTAINTIES, null]
const TRUSTED = CERTAINTIES.filter((certainty) => certainty !== 'contradicted')

const priority = (
  severity: ReviewFindingSeverity | null,
  certainty: ReviewFindingCertainty | null
) => deriveReviewFindingPriority({ severity, certainty })

describe('deriveReviewFindingPriority', () => {
  it('gives every combination of severity and certainty its place', () => {
    const table = Object.fromEntries(
      SEVERITIES.map((severity) => [
        severity ?? 'no severity',
        Object.fromEntries(
          CERTAINTIES.map((certainty) => [
            certainty ?? 'no certainty',
            priority(severity, certainty)
          ])
        )
      ])
    )

    expect(table).toEqual({
      error: { verified: 44, likely: 40, uncertain: 36, contradicted: -10, 'no certainty': 40 },
      warning: { verified: 34, likely: 30, uncertain: 26, contradicted: -20, 'no certainty': 30 },
      suggestion: {
        verified: 24,
        likely: 20,
        uncertain: 16,
        contradicted: -30,
        'no certainty': 20
      },
      nit: { verified: 14, likely: 10, uncertain: 6, contradicted: -40, 'no certainty': 10 },
      'no severity': { verified: 4, likely: 0, uncertain: -4, contradicted: -50, 'no certainty': 0 }
    })
  })

  it('puts a more serious finding first whatever the certainty, unless one is contradicted', () => {
    for (const [index, severity] of SEVERITIES.entries()) {
      for (const lower of SEVERITIES.slice(index + 1)) {
        for (const certainty of TRUSTED) {
          for (const lowerCertainty of TRUSTED) {
            expect(priority(severity, certainty)).toBeGreaterThan(priority(lower, lowerCertainty))
          }
        }
      }
    }
  })

  it('orders findings of one severity by how far they are backed', () => {
    for (const severity of SEVERITIES) {
      expect(priority(severity, 'verified')).toBeGreaterThan(priority(severity, 'likely'))
      // A draft written by hand has no certainty and counts as much as a confirmed quote.
      expect(priority(severity, null)).toBe(priority(severity, 'likely'))
      expect(priority(severity, 'likely')).toBeGreaterThan(priority(severity, 'uncertain'))
      expect(priority(severity, 'uncertain')).toBeGreaterThan(priority(severity, 'contradicted'))
    }
  })

  it('puts contradicted findings after every other draft, then by severity', () => {
    const lowestTrusted = Math.min(
      ...SEVERITIES.flatMap((severity) => TRUSTED.map((certainty) => priority(severity, certainty)))
    )
    const contradicted = SEVERITIES.map((severity) => priority(severity, 'contradicted'))

    expect(Math.max(...contradicted)).toBeLessThan(lowestTrusted)
    expect(contradicted).toEqual([...contradicted].sort((a, b) => b - a))
  })
})
