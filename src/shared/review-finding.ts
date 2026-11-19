// A review finding as every review provider in Orca models it: how serious it is, what its
// author offers as proof, and how far a host could check that proof.

export const REVIEW_FINDING_SEVERITIES = ['error', 'warning', 'suggestion', 'nit'] as const
export type ReviewFindingSeverity = (typeof REVIEW_FINDING_SEVERITIES)[number]

export function isReviewFindingSeverity(value: unknown): value is ReviewFindingSeverity {
  return REVIEW_FINDING_SEVERITIES.some((severity) => severity === value)
}

export const REVIEW_CODE_CITATION_KIND = 'code-citation'

export type ReviewLineRange = { startLine: number; endLine: number }

/** Lines of a file quoted as they are at the commit the finding was written on. */
export type ReviewCodeCitation = ReviewLineRange & {
  kind: typeof REVIEW_CODE_CITATION_KIND
  filePath: string
  quote: string
  /** What the quoted code shows, in the author's words. */
  note?: string
}

/** Evidence of a kind this build does not know: kept as it arrived and never trusted. */
export type ReviewUnknownEvidence = { kind: string; [field: string]: unknown }

export type ReviewFindingEvidence = ReviewCodeCitation | ReviewUnknownEvidence

/** Fields only an Orca host writes on evidence; what clients and agents send never keeps them. */
export const REVIEW_EVIDENCE_HOST_ONLY_FIELDS: readonly string[] = ['origin', 'check']

export function isReviewCodeCitation(evidence: {
  kind: string
  [field: string]: unknown
}): evidence is ReviewCodeCitation {
  return (
    evidence.kind === REVIEW_CODE_CITATION_KIND &&
    typeof evidence.filePath === 'string' &&
    typeof evidence.quote === 'string' &&
    typeof evidence.startLine === 'number' &&
    typeof evidence.endLine === 'number' &&
    Number.isInteger(evidence.startLine) &&
    Number.isInteger(evidence.endLine) &&
    evidence.startLine >= 1 &&
    evidence.endLine >= evidence.startLine &&
    (evidence.note === undefined || typeof evidence.note === 'string')
  )
}

export type ReviewEvidenceRefutation = 'file-missing' | 'lines-out-of-range' | 'text-mismatch'

export type ReviewEvidenceUncheckedReason =
  | 'unknown-kind'
  | 'unreadable-file'
  | 'commit-not-in-review'
  | 'request-limit'
  | 'request-failed'

/** What the host found when it compared one piece of evidence with the code. */
export type ReviewEvidenceCheck =
  | {
      status: 'confirmed'
      /** Where the quote really is, when it is not at the cited lines. */
      foundAt?: ReviewLineRange
    }
  | {
      status: 'refuted'
      reason: ReviewEvidenceRefutation
      /** The text at the cited lines. */
      actual?: string
    }
  | { status: 'unchecked'; reason: ReviewEvidenceUncheckedReason }

export const REVIEW_FINDING_CERTAINTIES = [
  'verified',
  'likely',
  'uncertain',
  'contradicted'
] as const
export type ReviewFindingCertainty = (typeof REVIEW_FINDING_CERTAINTIES)[number]

export function isReviewFindingCertainty(value: unknown): value is ReviewFindingCertainty {
  return REVIEW_FINDING_CERTAINTIES.some((certainty) => certainty === value)
}

export type ReviewEvidenceProof = 'verified' | 'likely'

/**
 * What confirmed evidence of a kind proves. `verified` is for evidence Orca produced or confirmed
 * by running something itself; a quote that matches the file shows only that the code is there.
 */
export const REVIEW_CONFIRMED_EVIDENCE_PROVES: ReadonlyMap<string, ReviewEvidenceProof> = new Map([
  [REVIEW_CODE_CITATION_KIND, 'likely']
])

/**
 * How far a finding can be believed, from its evidence and the host's check of each piece
 * (`checks[i]` belongs to `evidence[i]`; a missing check counts as not checked).
 */
export function deriveReviewFindingCertainty(
  evidence: readonly { kind: string }[],
  checks: readonly (ReviewEvidenceCheck | null | undefined)[],
  proves: ReadonlyMap<string, ReviewEvidenceProof> = REVIEW_CONFIRMED_EVIDENCE_PROVES
): ReviewFindingCertainty {
  let proven: ReviewEvidenceProof | null = null
  for (const [index, item] of evidence.entries()) {
    const check = checks[index]
    // Why first: one false claim outweighs whatever else the finding shows.
    if (check?.status === 'refuted') {
      return 'contradicted'
    }
    const proof = check?.status === 'confirmed' ? proves.get(item.kind) : undefined
    if (proof === 'verified' || (proof === 'likely' && proven === null)) {
      proven = proof
    }
  }
  return proven ?? 'uncertain'
}
