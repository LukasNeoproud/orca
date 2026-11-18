import type {
  AzureDevOpsReviewChangeType,
  AzureDevOpsReviewFileDiff
} from './azure-devops-review-types'

const HAS_ORIGINAL: ReadonlySet<AzureDevOpsReviewChangeType> = new Set(['edit', 'rename', 'delete'])
const HAS_MODIFIED: ReadonlySet<AzureDevOpsReviewChangeType> = new Set(['edit', 'rename', 'add'])

/**
 * The side the host reported missing although the change type says it exists, e.g. the original
 * of an edited file that answered 404. Shown as-is it would pass for an added or deleted file.
 */
export function azureDevOpsReviewUnloadedSide(
  changeType: AzureDevOpsReviewChangeType,
  diff: AzureDevOpsReviewFileDiff
): 'original' | 'modified' | null {
  if (diff.original.missing && HAS_ORIGINAL.has(changeType)) {
    return 'original'
  }
  if (diff.modified.missing && HAS_MODIFIED.has(changeType)) {
    return 'modified'
  }
  return null
}
