import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { openAzureDevOpsReviewWorktree } from './azure-devops-review-client'
import type { AzureDevOpsReviewWorktreeInfo } from '../../../shared/azure-devops-review-types'

/**
 * Switches the shared review worktree to a pull request, asking before it discards uncommitted
 * changes there. Null when the user declined or the switch failed (already reported).
 */
export async function switchAzureDevOpsReviewWorktree(
  pullRequestKey: string,
  confirm: ConfirmationDialogContextValue
): Promise<AzureDevOpsReviewWorktreeInfo | null> {
  let result = await openAzureDevOpsReviewWorktree(pullRequestKey)
  if (!result.ok && result.reason === 'dirty') {
    const discard = await confirm({
      title: translate('azureDevOpsReview.dirtyTitle', 'Discard changes in the review workspace?'),
      description: translate(
        'azureDevOpsReview.dirtyDescription',
        'The shared review workspace has uncommitted changes. Switching to this pull request discards them; ignored files such as dependencies stay.'
      ),
      confirmLabel: translate('azureDevOpsReview.dirtyConfirm', 'Discard and switch'),
      confirmVariant: 'destructive'
    })
    if (!discard) {
      return null
    }
    result = await openAzureDevOpsReviewWorktree(pullRequestKey, true)
  }
  if (!result.ok) {
    toast.error(result.message)
    return null
  }
  useAzureDevOpsReviewChatLinks
    .getState()
    .setWorktreePullRequest(result.worktree.worktreeId, result.worktree.pullRequestKey)
  return result.worktree
}
