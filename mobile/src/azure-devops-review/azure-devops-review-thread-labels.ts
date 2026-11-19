import { azureDevOpsReviewThreadOriginLabel } from '../../../src/shared/azure-devops-review-thread-origin-label'
import type { AzureDevOpsReviewThread } from '../../../src/shared/azure-devops-review-types'

type LabelledThread = Pick<
  AzureDevOpsReviewThread,
  'status' | 'filePath' | 'anchor' | 'outdated' | 'originalAnchor' | 'iterationId'
>

/** Thread status, with a note when a later iteration rewrote or removed the commented lines. */
export function reviewThreadStateLabel(
  thread: Pick<LabelledThread, 'status' | 'outdated'>
): string {
  return thread.outdated ? `${thread.status} · outdated` : thread.status
}

/** Where an outdated thread was written; null while the thread names its own lines. */
export function reviewThreadOriginNote(thread: LabelledThread): string | null {
  const origin = thread.outdated ? azureDevOpsReviewThreadOriginLabel(thread) : null
  return origin ? `was ${origin}` : null
}

/** `path:line` of a thread in the latest iteration, with where it was once its lines are gone. */
export function reviewThreadLocationLabel(thread: LabelledThread): string {
  if (!thread.filePath) {
    return 'General comment'
  }
  if (thread.anchor) {
    return `${thread.filePath}:${thread.anchor.startLine}`
  }
  const origin = reviewThreadOriginNote(thread)
  return origin ? `${thread.filePath} · ${origin}` : thread.filePath
}
