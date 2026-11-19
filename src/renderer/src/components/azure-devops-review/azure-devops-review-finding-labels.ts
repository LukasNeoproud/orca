import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewDraftView } from '../../../../shared/azure-devops-review-types'
import {
  isReviewCodeCitation,
  isReviewFindingCertainty,
  isReviewFindingSeverity,
  type ReviewEvidenceCheck,
  type ReviewFindingCertainty,
  type ReviewFindingEvidence,
  type ReviewFindingSeverity
} from '../../../../shared/review-finding'
import { lineRangeLabel } from './azure-devops-review-labels'

export function findingSeverityLabel(severity: ReviewFindingSeverity): string {
  switch (severity) {
    case 'error':
      return translate('azureDevOpsReview.severityError', 'Error')
    case 'warning':
      return translate('azureDevOpsReview.severityWarning', 'Warning')
    case 'suggestion':
      return translate('azureDevOpsReview.severitySuggestion', 'Suggestion')
    case 'nit':
      return translate('azureDevOpsReview.severityNit', 'Nit')
  }
}

export function findingCertaintyLabel(certainty: ReviewFindingCertainty): string {
  switch (certainty) {
    case 'verified':
      return translate('azureDevOpsReview.certaintyVerified', 'Verified')
    case 'likely':
      return translate('azureDevOpsReview.certaintyLikely', 'Likely')
    case 'uncertain':
      return translate('azureDevOpsReview.certaintyUncertain', 'Uncertain')
    case 'contradicted':
      return translate('azureDevOpsReview.certaintyContradicted', 'Contradicted')
  }
}

export function findingCertaintyHint(certainty: ReviewFindingCertainty): string {
  switch (certainty) {
    case 'verified':
      return translate(
        'azureDevOpsReview.certaintyVerifiedHint',
        'Orca confirmed the evidence of this finding itself.'
      )
    case 'likely':
      return translate(
        'azureDevOpsReview.certaintyLikelyHint',
        'The quoted code is in the file at the commit of the draft. Whether the finding is right is for you to judge.'
      )
    case 'uncertain':
      return translate(
        'azureDevOpsReview.certaintyUncertainHint',
        'The agent gave no evidence that Orca could confirm.'
      )
    case 'contradicted':
      return translate(
        'azureDevOpsReview.certaintyContradictedHint',
        'A quote the agent gave is not in the file where it says. See the evidence.'
      )
  }
}

/** The severity to show; a value from a newer host that this build cannot name is not shown. */
export function draftSeverity(
  draft: Pick<AzureDevOpsReviewDraftView, 'severity'>
): ReviewFindingSeverity | null {
  return isReviewFindingSeverity(draft.severity) ? draft.severity : null
}

/**
 * The certainty to show: only unpublished drafts of an agent carry one. A value from a newer host
 * that this build cannot name reads as uncertain, the mark that promises least.
 */
export function draftCertainty(
  draft: Pick<AzureDevOpsReviewDraftView, 'certainty'>
): ReviewFindingCertainty | null {
  if (draft.certainty === undefined || draft.certainty === null) {
    return null
  }
  return isReviewFindingCertainty(draft.certainty) ? draft.certainty : 'uncertain'
}

/** Severity and certainty in one line, for places that show a draft as text; null when neither. */
export function draftFindingSummary(
  draft: Pick<AzureDevOpsReviewDraftView, 'severity' | 'certainty'>
): string | null {
  const severity = draftSeverity(draft)
  const certainty = draftCertainty(draft)
  const parts = [
    ...(severity ? [findingSeverityLabel(severity)] : []),
    ...(certainty ? [findingCertaintyLabel(certainty)] : [])
  ]
  return parts.length > 0 ? parts.join(' · ') : null
}

export type EvidenceCheckOutcome = 'confirmed' | 'refuted' | 'unchecked'

/** A check as far as this build understands it; anything else counts as not checked. */
export function evidenceCheckOutcome(
  check: ReviewEvidenceCheck | null | undefined
): EvidenceCheckOutcome {
  return check?.status === 'confirmed' || check?.status === 'refuted' ? check.status : 'unchecked'
}

export function evidenceCheckLabel(outcome: EvidenceCheckOutcome): string {
  switch (outcome) {
    case 'confirmed':
      return translate('azureDevOpsReview.evidenceConfirmed', 'In the file')
    case 'refuted':
      return translate('azureDevOpsReview.evidenceRefuted', 'Not in the file')
    case 'unchecked':
      return translate('azureDevOpsReview.evidenceUnchecked', 'Not checked')
  }
}

/** Why a check ended as it did, when there is more to say than its label; otherwise null. */
export function evidenceCheckExplanation(
  check: ReviewEvidenceCheck | null | undefined
): string | null {
  if (!check) {
    return null
  }
  if (check.status === 'confirmed') {
    return check.foundAt
      ? translate(
          'azureDevOpsReview.evidenceFoundElsewhere',
          'The quote is at lines {{value0}}, not at the cited lines.',
          { value0: lineRangeLabel(check.foundAt) }
        )
      : null
  }
  if (check.status === 'refuted') {
    switch (check.reason) {
      case 'file-missing':
        return translate(
          'azureDevOpsReview.evidenceFileMissing',
          'The file does not exist at the commit of the draft.'
        )
      case 'lines-out-of-range':
        return translate(
          'azureDevOpsReview.evidenceLinesOutOfRange',
          'The file is shorter than the cited lines.'
        )
      case 'text-mismatch':
        return translate(
          'azureDevOpsReview.evidenceTextMismatch',
          'The file has other text at the cited lines:'
        )
    }
    // A reason only a newer host knows: the label alone has to do.
    return null
  }
  switch (check.reason) {
    case 'unknown-kind':
      return translate(
        'azureDevOpsReview.evidenceUnknownKind',
        'This version of Orca cannot check this kind of evidence.'
      )
    case 'unreadable-file':
      return translate(
        'azureDevOpsReview.evidenceUnreadableFile',
        'The file is binary or too large to compare.'
      )
    case 'commit-not-in-review':
      return translate(
        'azureDevOpsReview.evidenceCommitNotInReview',
        'The commit of the draft is not part of this pull request.'
      )
    case 'request-limit':
      return translate(
        'azureDevOpsReview.evidenceRequestLimit',
        'Not checked yet. Reload the pull request to check it.'
      )
    case 'request-failed':
      return translate(
        'azureDevOpsReview.evidenceRequestFailed',
        'The file could not be read from Azure DevOps.'
      )
  }
  // A check or a reason only a newer host knows.
  return null
}

/** `path:lines` of a code citation, or the kind of evidence this build does not know. */
export function evidenceLocationLabel(evidence: ReviewFindingEvidence): string {
  return isReviewCodeCitation(evidence)
    ? `${evidence.filePath}:${lineRangeLabel(evidence)}`
    : evidence.kind
}
