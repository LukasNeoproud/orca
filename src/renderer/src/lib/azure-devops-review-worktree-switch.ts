import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { openAzureDevOpsReviewWorktree } from './azure-devops-review-client'
import type { AzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-options'
import type { AzureDevOpsReviewWorktreeInfo } from '../../../shared/azure-devops-review-types'

/**
 * Opens the pull request's review worktree, asking before it discards uncommitted changes there.
 * Null when the user declined or the switch failed (already reported).
 * `depth` is passed only when the user just chose it in the review options.
 */
export async function switchAzureDevOpsReviewWorktree(
  pullRequestKey: string,
  confirm: ConfirmationDialogContextValue,
  depth?: AzureDevOpsReviewDepth
): Promise<(AzureDevOpsReviewWorktreeInfo & { piExtensionPath?: string }) | null> {
  let result = await openAzureDevOpsReviewWorktree(pullRequestKey, false, depth)
  if (!result.ok && result.reason === 'dirty') {
    const discard = await confirm({
      title: translate('azureDevOpsReview.dirtyTitle', 'Discard changes in the review workspace?'),
      description: translate(
        'azureDevOpsReview.dirtyDescription',
        'The review workspace of this pull request has uncommitted changes. Opening it again discards them; ignored files such as dependencies stay.'
      ),
      confirmLabel: translate('azureDevOpsReview.dirtyConfirm', 'Discard and open'),
      confirmVariant: 'destructive'
    })
    if (!discard) {
      return null
    }
    result = await openAzureDevOpsReviewWorktree(pullRequestKey, true, depth)
  }
  if (!result.ok) {
    toast.error(result.message)
    return null
  }
  useAzureDevOpsReviewChatLinks
    .getState()
    .setWorktreePullRequest(result.worktree.worktreeId, result.worktree.pullRequestKey)
  return { ...result.worktree, piExtensionPath: result.piExtensionPath }
}
