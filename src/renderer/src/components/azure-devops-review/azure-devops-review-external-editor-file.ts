import { joinPath } from '@/lib/path'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import type { ExternalEditorFileSource } from '../external-editor-file-open/external-editor-file-target'

/**
 * The changed file inside the review worktree. Null unless that worktree has this pull request
 * checked out: any other checkout would open different code than the diff shows.
 */
export function getAzureDevOpsReviewExternalEditorFile(
  detail: AzureDevOpsReviewDetail,
  change: AzureDevOpsReviewChange
): ExternalEditorFileSource | null {
  const worktree = detail.reviewWorktree
  if (
    !worktree ||
    worktree.pullRequestKey !== detail.pullRequest.key ||
    change.changeType === 'delete'
  ) {
    return null
  }
  return { filePath: joinPath(worktree.path, change.path), worktreeId: worktree.worktreeId }
}
