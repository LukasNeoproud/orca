import type {
  ReviewEvidenceCheck,
  ReviewFindingCertainty,
  ReviewFindingEvidence,
  ReviewFindingSeverity
} from './review-finding'

/** What a draft carries as a finding. Stored with the draft, never published. */
export type AzureDevOpsReviewDraftFinding = {
  /** How serious the finding is; absent when nobody said. */
  severity?: ReviewFindingSeverity
  /** What the author offers as proof, as sent: untrusted. */
  evidence?: ReviewFindingEvidence[]
}

/** A finding as a caller sets it on a new draft or in a patch. */
export type AzureDevOpsReviewDraftFindingInput = {
  /** `null` removes the severity. */
  severity?: ReviewFindingSeverity | null
  /** Replaces the whole list; `null` or an empty list removes it. */
  evidence?: ReviewFindingEvidence[] | null
}

/** The lines an inline draft comments, as they are at the draft's commit. */
export type AzureDevOpsReviewDraftCodeExcerpt = {
  startLine: number
  lines: string[]
  /** The commented range is longer than `lines`. */
  truncated?: true
}

/** What the host works out for a draft on every read; none of it is stored. */
export type AzureDevOpsReviewDraftFindingView = {
  /** The host's check of `evidence[i]`; absent on published drafts and from older hosts. */
  evidenceChecks?: ReviewEvidenceCheck[]
  /** Unpublished agent drafts only: how far the host could back the finding. */
  certainty?: ReviewFindingCertainty
  codeExcerpt?: AzureDevOpsReviewDraftCodeExcerpt
}
