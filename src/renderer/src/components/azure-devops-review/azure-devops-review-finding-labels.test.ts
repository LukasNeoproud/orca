import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewDraftView } from '../../../../shared/azure-devops-review-types'
import {
  REVIEW_FINDING_CERTAINTIES,
  REVIEW_FINDING_SEVERITIES,
  type ReviewEvidenceCheck
} from '../../../../shared/review-finding'
import {
  draftCertainty,
  draftFindingSummary,
  draftSeverity,
  evidenceCheckExplanation,
  evidenceCheckLabel,
  evidenceCheckOutcome,
  evidenceLocationLabel,
  findingCertaintyHint,
  findingCertaintyLabel,
  findingSeverityLabel
} from './azure-devops-review-finding-labels'

/** A value a newer host may send where this build's types name fewer. */
function fromNewerHost<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tests pass values the types forbid to prove the labels survive them.
  return value as T
}

describe('finding labels', () => {
  it('names every severity and every certainty, each with a hint', () => {
    expect(REVIEW_FINDING_SEVERITIES.map(findingSeverityLabel)).toEqual([
      'Error',
      'Warning',
      'Suggestion',
      'Nit'
    ])
    expect(REVIEW_FINDING_CERTAINTIES.map(findingCertaintyLabel)).toEqual([
      'Verified',
      'Likely',
      'Uncertain',
      'Contradicted'
    ])
    for (const certainty of REVIEW_FINDING_CERTAINTIES) {
      expect(findingCertaintyHint(certainty).length).toBeGreaterThan(20)
    }
  })

  it('shows no certainty for a draft that carries none', () => {
    expect(draftCertainty({})).toBeNull()
    expect(draftFindingSummary({})).toBeNull()
  })

  it('reads a certainty or severity it cannot name as the one that promises least', () => {
    const draft = fromNewerHost<Pick<AzureDevOpsReviewDraftView, 'severity' | 'certainty'>>({
      severity: 'blocker',
      certainty: 'proven-by-test'
    })
    expect(draftCertainty(draft)).toBe('uncertain')
    expect(draftSeverity(draft)).toBeNull()
    expect(draftFindingSummary(draft)).toBe('Uncertain')
  })

  it('joins severity and certainty into one line', () => {
    expect(draftFindingSummary({ severity: 'warning', certainty: 'likely' })).toBe(
      'Warning · Likely'
    )
    expect(draftFindingSummary({ severity: 'nit' })).toBe('Nit')
    expect(draftFindingSummary({ certainty: 'contradicted' })).toBe('Contradicted')
  })
})

describe('evidence check labels', () => {
  it.each<[ReviewEvidenceCheck | undefined, string, string | null]>([
    [{ status: 'confirmed' }, 'In the file', null],
    [
      { status: 'confirmed', foundAt: { startLine: 12, endLine: 14 } },
      'In the file',
      'The quote is at lines 12–14, not at the cited lines.'
    ],
    [
      { status: 'refuted', reason: 'text-mismatch', actual: 'x' },
      'Not in the file',
      'The file has other text at the cited lines:'
    ],
    [
      { status: 'refuted', reason: 'file-missing' },
      'Not in the file',
      'The file does not exist at the commit of the draft.'
    ],
    [
      { status: 'refuted', reason: 'lines-out-of-range' },
      'Not in the file',
      'The file is shorter than the cited lines.'
    ],
    [
      { status: 'unchecked', reason: 'unknown-kind' },
      'Not checked',
      'This version of Orca cannot check this kind of evidence.'
    ],
    [
      { status: 'unchecked', reason: 'unreadable-file' },
      'Not checked',
      'The file is binary or too large to compare.'
    ],
    [
      { status: 'unchecked', reason: 'commit-not-in-review' },
      'Not checked',
      'The commit of the draft is not part of this pull request.'
    ],
    [
      { status: 'unchecked', reason: 'request-limit' },
      'Not checked',
      'Not checked yet. Reload the pull request to check it.'
    ],
    [
      { status: 'unchecked', reason: 'request-failed' },
      'Not checked',
      'The file could not be read from Azure DevOps.'
    ],
    [undefined, 'Not checked', null]
  ])('describes %j', (check, label, explanation) => {
    expect(evidenceCheckLabel(evidenceCheckOutcome(check))).toBe(label)
    expect(evidenceCheckExplanation(check)).toBe(explanation)
  })

  it('counts a check it cannot read as not checked', () => {
    const check = fromNewerHost<ReviewEvidenceCheck>({ status: 'reproduced', runId: 7 })
    expect(evidenceCheckOutcome(check)).toBe('unchecked')
    expect(evidenceCheckExplanation(check)).toBeNull()
  })

  it('names where a citation points and the kind of other evidence', () => {
    expect(
      evidenceLocationLabel({
        kind: 'code-citation',
        filePath: 'src/cart.ts',
        startLine: 4,
        endLine: 6,
        quote: 'x'
      })
    ).toBe('src/cart.ts:4–6')
    expect(evidenceLocationLabel({ kind: 'emulator-recording', screen: 'Checkout' })).toBe(
      'emulator-recording'
    )
  })
})
