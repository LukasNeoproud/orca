import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewDraftAuthor,
  AzureDevOpsReviewDraftKind
} from '../../../shared/azure-devops-review-types'
import {
  deriveReviewFindingCertainty,
  REVIEW_FINDING_SEVERITIES,
  type ReviewEvidenceCheck,
  type ReviewFindingEvidence,
  type ReviewFindingSeverity
} from '../../../shared/review-finding'
import {
  azureDevOpsReviewDraftCertainty,
  isAzureDevOpsReviewDraftFinding
} from './azure-devops-review-draft-certainty'

const citation: ReviewFindingEvidence = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 4,
  quote: 'sum += item'
}

const EVIDENCE_STATES: [string, ReviewFindingEvidence[], ReviewEvidenceCheck[]][] = [
  ['no evidence', [], []],
  ['a confirmed citation', [citation], [{ status: 'confirmed' }]],
  ['an unchecked citation', [citation], [{ status: 'unchecked', reason: 'request-limit' }]],
  [
    'a refuted citation',
    [citation, citation],
    [{ status: 'confirmed' }, { status: 'refuted', reason: 'text-mismatch', actual: 'x' }]
  ]
]

const agent: AzureDevOpsReviewDraftAuthor = { kind: 'agent', label: 'Claude' }
const KINDS: AzureDevOpsReviewDraftKind[] = ['inline', 'file', 'general', 'reply']
const SEVERITIES: (ReviewFindingSeverity | undefined)[] = [undefined, ...REVIEW_FINDING_SEVERITIES]

describe('isAzureDevOpsReviewDraftFinding', () => {
  it('counts every draft that opens a thread as a finding, with or without a severity', () => {
    for (const kind of ['inline', 'file', 'general'] as const) {
      for (const severity of SEVERITIES) {
        expect(isAzureDevOpsReviewDraftFinding({ kind, author: agent, severity })).toBe(true)
      }
    }
  })

  it('counts a reply as a finding only when it carries a severity', () => {
    expect(isAzureDevOpsReviewDraftFinding({ kind: 'reply', author: agent })).toBe(false)
    for (const severity of REVIEW_FINDING_SEVERITIES) {
      expect(isAzureDevOpsReviewDraftFinding({ kind: 'reply', author: agent, severity })).toBe(true)
    }
  })
})

describe('azureDevOpsReviewDraftCertainty', () => {
  it('gives every finding of an agent the certainty its evidence earns', () => {
    for (const kind of KINDS) {
      for (const severity of SEVERITIES) {
        if (!isAzureDevOpsReviewDraftFinding({ kind, author: agent, severity })) {
          continue
        }
        for (const [, evidence, checks] of EVIDENCE_STATES) {
          expect(
            azureDevOpsReviewDraftCertainty({ kind, author: agent, severity, evidence }, checks)
          ).toBe(deriveReviewFindingCertainty(evidence, checks))
        }
      }
    }
  })

  it.each([
    ['no evidence', undefined],
    ['a confirmed citation', undefined],
    ['an unchecked citation', undefined],
    ['a refuted citation', 'contradicted']
  ])('shows an answer of an agent in a thread with %s as %s', (name, expected) => {
    const [, evidence, checks] = EVIDENCE_STATES.find(([state]) => state === name) ?? []
    expect(
      azureDevOpsReviewDraftCertainty({ kind: 'reply', author: agent, evidence }, checks ?? [])
    ).toBe(expected)
  })

  it('gives no draft a person wrote a certainty, not even with a refuted citation', () => {
    for (const kind of KINDS) {
      for (const severity of SEVERITIES) {
        for (const [, evidence, checks] of EVIDENCE_STATES) {
          expect(
            azureDevOpsReviewDraftCertainty(
              { kind, author: { kind: 'user' }, severity, evidence },
              checks
            )
          ).toBeUndefined()
        }
      }
    }
  })
})
