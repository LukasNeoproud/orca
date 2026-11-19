import { translate } from '@/i18n/i18n'
import type { AzureDevOpsReviewVote } from '../../../../shared/azure-devops-review-types'
import type { AzureDevOpsReviewCastableVote } from '../../../../shared/azure-devops-review-vote'

/** A vote as a state, for "your vote: …". */
export function azureDevOpsReviewVoteLabel(vote: AzureDevOpsReviewVote): string {
  switch (vote) {
    case 'approved':
      return translate('azureDevOpsReview.voteStateApproved', 'Approved')
    case 'approved-with-suggestions':
      return translate(
        'azureDevOpsReview.voteStateApprovedWithSuggestions',
        'Approved with suggestions'
      )
    case 'waiting-for-author':
      return translate('azureDevOpsReview.voteStateWaitingForAuthor', 'Waiting for author')
    case 'rejected':
      return translate('azureDevOpsReview.voteStateRejected', 'Rejected')
    case 'none':
      return translate('azureDevOpsReview.voteStateNone', 'No vote')
  }
}

/** A vote as the action that casts it, for the vote picker. */
export function azureDevOpsReviewVoteActionLabel(vote: AzureDevOpsReviewCastableVote): string {
  switch (vote) {
    case 'approved':
      return translate('azureDevOpsReview.voteActionApprove', 'Approve')
    case 'approved-with-suggestions':
      return translate(
        'azureDevOpsReview.voteActionApproveWithSuggestions',
        'Approve with suggestions'
      )
    case 'waiting-for-author':
      return translate('azureDevOpsReview.voteActionWaitForAuthor', 'Wait for author')
    case 'rejected':
      return translate('azureDevOpsReview.voteActionReject', 'Reject')
  }
}
