import { translate } from '@/i18n/i18n'
import type {
  AzureDevOpsLineAnchor,
  AzureDevOpsReviewChangeType,
  AzureDevOpsReviewDraft,
  AzureDevOpsReviewThread,
  AzureDevOpsThreadStatus
} from '../../../../shared/azure-devops-review-types'

export function threadStatusLabel(status: AzureDevOpsThreadStatus): string {
  switch (status) {
    case 'active':
      return translate('azureDevOpsReview.threadActive', 'Active')
    case 'fixed':
      return translate('azureDevOpsReview.threadFixed', 'Resolved')
    case 'wontFix':
      return translate('azureDevOpsReview.threadWontFix', "Won't fix")
    case 'closed':
      return translate('azureDevOpsReview.threadClosed', 'Closed')
    case 'byDesign':
      return translate('azureDevOpsReview.threadByDesign', 'By design')
    case 'pending':
      return translate('azureDevOpsReview.threadPending', 'Pending')
    case 'unknown':
      return translate('azureDevOpsReview.threadUnknown', 'Unknown')
  }
}

/** `path:line` (or a range) of a thread; null for a general thread. */
export function threadLocationLabel(
  thread: Pick<AzureDevOpsReviewThread, 'filePath' | 'anchor'>
): string | null {
  if (!thread.filePath) {
    return null
  }
  if (!thread.anchor) {
    return thread.filePath
  }
  return `${thread.filePath}:${lineRangeLabel(thread.anchor)}`
}

export function lineRangeLabel(
  anchor: Pick<AzureDevOpsLineAnchor, 'startLine' | 'endLine'>
): string {
  return anchor.startLine === anchor.endLine
    ? `${anchor.startLine}`
    : `${anchor.startLine}–${anchor.endLine}`
}

/** Thread status for display; an outdated thread says so next to it. */
export function threadStateLabel(
  thread: Pick<AzureDevOpsReviewThread, 'status' | 'outdated'>
): string {
  const status = threadStatusLabel(thread.status)
  return thread.outdated
    ? `${status} · ${translate('azureDevOpsReview.threadOutdated', 'Outdated')}`
    : status
}

/** Where an outdated thread was written; null while the thread still names its own lines. */
export function threadOriginLabel(
  thread: Pick<AzureDevOpsReviewThread, 'outdated' | 'originalAnchor' | 'iterationId'>
): string | null {
  if (!thread.outdated || !thread.originalAnchor) {
    return null
  }
  return translate('azureDevOpsReview.threadOrigin', 'was L{{value0}} in iteration {{value1}}', {
    value0: lineRangeLabel(thread.originalAnchor),
    value1: thread.iterationId ?? '?'
  })
}

export function changeTypeLabel(changeType: AzureDevOpsReviewChangeType): string {
  switch (changeType) {
    case 'add':
      return 'A'
    case 'delete':
      return 'D'
    case 'rename':
      return 'R'
    case 'edit':
      return 'M'
    case 'other':
      return '•'
  }
}

export function draftLocationLabel(
  draft: Pick<AzureDevOpsReviewDraft, 'kind' | 'filePath' | 'anchor' | 'threadId'>
): string {
  switch (draft.kind) {
    case 'inline': {
      const anchor = draft.anchor
      const lines = anchor ? lineRangeLabel(anchor) : '?'
      const side =
        anchor?.side === 'left'
          ? ` (${translate('azureDevOpsReview.sideLeft', 'Old version')})`
          : ''
      return `${draft.filePath ?? ''}:${lines}${side}`
    }
    case 'file':
      return draft.filePath ?? ''
    case 'reply':
      return translate('azureDevOpsReview.replyTo', 'Reply to thread #{{value0}}', {
        value0: draft.threadId ?? '?'
      })
    case 'general':
      return translate('azureDevOpsReview.generalComment', 'General comment')
  }
}
