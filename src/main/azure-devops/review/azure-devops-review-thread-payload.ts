import type {
  AzureDevOpsReviewDraft,
  AzureDevOpsThreadStatus
} from '../../../shared/azure-devops-review-types'
import { toAzureDevOpsItemPath } from './azure-devops-review-mappers'

const THREAD_STATUS_TO_WIRE: Record<AzureDevOpsThreadStatus, number | null> = {
  active: 1,
  fixed: 2,
  wontFix: 3,
  closed: 4,
  byDesign: 5,
  pending: 6,
  unknown: null
}

export function azureDevOpsThreadStatusToWire(status: AzureDevOpsThreadStatus): number | null {
  return THREAD_STATUS_TO_WIRE[status]
}

function position(line: number, edge: 'start' | 'end'): { line: number; offset: number } {
  // Why: offset 1 at the start and a large end offset cover the whole line range.
  return { line, offset: edge === 'start' ? 1 : 10_000 }
}

/** Body for `POST …/pullRequests/{id}/threads` creating a new comment thread. */
export function buildAzureDevOpsThreadPayload(
  draft: Pick<AzureDevOpsReviewDraft, 'kind' | 'filePath' | 'anchor' | 'body'>,
  context: { iterationId: number | null; changeTrackingId: number | null }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    comments: [{ parentCommentId: 0, content: draft.body, commentType: 1 }],
    status: 1
  }
  if ((draft.kind !== 'inline' && draft.kind !== 'file') || !draft.filePath) {
    return payload
  }
  const threadContext: Record<string, unknown> = { filePath: toAzureDevOpsItemPath(draft.filePath) }
  if (draft.kind === 'inline' && draft.anchor) {
    const prefix = draft.anchor.side === 'left' ? 'left' : 'right'
    threadContext[`${prefix}FileStart`] = position(draft.anchor.startLine, 'start')
    threadContext[`${prefix}FileEnd`] = position(draft.anchor.endLine, 'end')
  }
  payload.threadContext = threadContext
  if (context.iterationId !== null) {
    payload.pullRequestThreadContext = {
      iterationContext: {
        firstComparingIteration: 1,
        secondComparingIteration: context.iterationId
      },
      ...(context.changeTrackingId !== null ? { changeTrackingId: context.changeTrackingId } : {})
    }
  }
  return payload
}
