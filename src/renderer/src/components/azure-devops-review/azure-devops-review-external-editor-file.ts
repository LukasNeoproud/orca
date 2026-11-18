import { joinPath } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import {
  describeDeletedExternalEditorFile,
  type ExternalEditorFileAvailability
} from '../external-editor-file-open/external-editor-file-availability'

/**
 * The changed file inside the review worktree, or why it cannot be opened. Only that worktree
 * with this pull request checked out qualifies: any other checkout would open different code.
 */
export function getAzureDevOpsReviewExternalEditorAvailability(
  detail: AzureDevOpsReviewDetail,
  change: AzureDevOpsReviewChange
): ExternalEditorFileAvailability {
  const worktree = detail.reviewWorktree
  if (!worktree) {
    return {
      unavailableReason: translate(
        'azureDevOpsReview.openInIdeNoWorkspace',
        'Open this pull request in its review workspace first; IDEs open files from there.'
      )
    }
  }
  if (worktree.pullRequestKey !== detail.pullRequest.key) {
    return {
      unavailableReason: translate(
        'azureDevOpsReview.openInIdeOtherPullRequest',
        'The review workspace has another pull request checked out. Open this one in the workspace first.'
      )
    }
  }
  if (change.changeType === 'delete') {
    return { unavailableReason: describeDeletedExternalEditorFile() }
  }
  return {
    file: { filePath: joinPath(worktree.path, change.path), worktreeId: worktree.worktreeId }
  }
}
