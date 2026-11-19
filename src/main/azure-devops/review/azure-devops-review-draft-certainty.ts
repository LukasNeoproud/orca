import type { AzureDevOpsReviewDraft } from '../../../shared/azure-devops-review-types'
import {
  deriveReviewFindingCertainty,
  type ReviewEvidenceCheck,
  type ReviewFindingCertainty
} from '../../../shared/review-finding'

type DraftAsFinding = Pick<AzureDevOpsReviewDraft, 'kind' | 'author' | 'severity' | 'evidence'>

/**
 * Whether a draft stands as a finding of its own. A reply without a severity answers its thread;
 * the AI review prompt asks a severity of every finding, replies included.
 */
export function isAzureDevOpsReviewDraftFinding(draft: DraftAsFinding): boolean {
  return draft.kind !== 'reply' || draft.severity !== undefined
}

/**
 * The certainty the host shows for an unpublished draft; undefined shows none. An answer in a
 * thread shows only `contradicted`: a quote the agent made up is its error, not missing proof.
 */
export function azureDevOpsReviewDraftCertainty(
  draft: DraftAsFinding,
  evidenceChecks: readonly ReviewEvidenceCheck[]
): ReviewFindingCertainty | undefined {
  // Why agents only: what a person writes is their own judgement, not a claim to check.
  if (draft.author.kind !== 'agent') {
    return undefined
  }
  const certainty = deriveReviewFindingCertainty(draft.evidence ?? [], evidenceChecks)
  return isAzureDevOpsReviewDraftFinding(draft) || certainty === 'contradicted'
    ? certainty
    : undefined
}
