import { translate } from '@/i18n/i18n'
import type {
  AzureDevOpsReviewChangeType,
  AzureDevOpsReviewDraft,
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
      const lines = anchor
        ? anchor.startLine === anchor.endLine
          ? `${anchor.startLine}`
          : `${anchor.startLine}–${anchor.endLine}`
        : '?'
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
