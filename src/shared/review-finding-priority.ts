import type { ReviewFindingCertainty, ReviewFindingSeverity } from './review-finding'

/**
 * What a finding's priority is worked out from. A later factor (how often the problem repeats, a
 * priority the reviewer sets by hand) joins as another optional field and another term of the sum.
 */
export type ReviewFindingPriorityInput = {
  severity: ReviewFindingSeverity | null
  certainty: ReviewFindingCertainty | null
}

/** Bands ten apart, so certainty orders findings within a severity and never across one. */
export const REVIEW_FINDING_SEVERITY_POINTS: Readonly<Record<ReviewFindingSeverity, number>> = {
  error: 40,
  warning: 30,
  suggestion: 20,
  nit: 10
}

/** A draft without a certainty (written by hand, a reply) is neither raised nor lowered. */
export const REVIEW_FINDING_CERTAINTY_POINTS: Readonly<Record<ReviewFindingCertainty, number>> = {
  verified: 4,
  likely: 0,
  uncertain: -4,
  // Why below every draft without a severity: after a made-up quote nothing in the finding is trusted.
  contradicted: -50
}

/** Higher comes first: the points of the severity plus the points of the certainty. */
export function deriveReviewFindingPriority(input: ReviewFindingPriorityInput): number {
  const severity = input.severity ? REVIEW_FINDING_SEVERITY_POINTS[input.severity] : 0
  const certainty = input.certainty ? REVIEW_FINDING_CERTAINTY_POINTS[input.certainty] : 0
  return severity + certainty
}
