import type { AzureDevOpsReviewThread } from './azure-devops-review-types'

/** "line 16 of iteration 1": where a thread was written, once its lines moved or went away. */
export function azureDevOpsReviewThreadOriginLabel(
  thread: Pick<AzureDevOpsReviewThread, 'originalAnchor' | 'iterationId'>
): string | null {
  const anchor = thread.originalAnchor
  if (!anchor) {
    return null
  }
  const lines =
    anchor.startLine === anchor.endLine
      ? `line ${anchor.startLine}`
      : `lines ${anchor.startLine}-${anchor.endLine}`
  return thread.iterationId ? `${lines} of iteration ${thread.iterationId}` : lines
}
