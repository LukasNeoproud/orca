import { translate } from '@/i18n/i18n'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDraftAuthor,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewThread
} from '../../../../shared/azure-devops-review-types'
import type {
  ReviewFindingFileRank,
  ReviewFindingListItem
} from '../../../../shared/review-finding-list-view'
import { getCombinedDiffBranchEntriesInTreeOrder } from '../editor/combined-diff/browse-files/combined-diff-file-tree-filter'
import { azureDevOpsChangeToBranchEntry } from './azure-devops-review-diff-sections'
import { draftCertainty, draftSeverity } from './azure-devops-review-finding-labels'

export type AzureDevOpsReviewDraftListItem = ReviewFindingListItem & {
  draft: AzureDevOpsReviewDraftView
}

const USER_AUTHOR_KEY = 'user'
const AGENT_AUTHOR_KEY = 'agent'
const AGENT_AUTHOR_PREFIX = 'agent:'

export function azureDevOpsReviewDraftAuthorKey(author: AzureDevOpsReviewDraftAuthor): string {
  if (author.kind === 'user') {
    return USER_AUTHOR_KEY
  }
  return author.label ? `${AGENT_AUTHOR_PREFIX}${author.label}` : AGENT_AUTHOR_KEY
}

/** The author as a draft card names it. */
export function azureDevOpsReviewDraftAuthorLabel(authorKey: string): string {
  if (authorKey === USER_AUTHOR_KEY) {
    return translate('azureDevOpsReview.youAuthor', 'You')
  }
  return authorKey.startsWith(AGENT_AUTHOR_PREFIX)
    ? authorKey.slice(AGENT_AUTHOR_PREFIX.length)
    : translate('azureDevOpsReview.agentAuthor', 'Agent')
}

/** Drafts as the list sorts and filters them; a reply is placed at its thread's file and line. */
export function azureDevOpsReviewDraftListItems(
  drafts: readonly AzureDevOpsReviewDraftView[],
  threads: readonly Pick<AzureDevOpsReviewThread, 'id' | 'filePath' | 'anchor'>[]
): AzureDevOpsReviewDraftListItem[] {
  const threadById = new Map(threads.map((thread) => [thread.id, thread]))
  return drafts.map((draft) => {
    const thread =
      draft.kind === 'reply' && draft.threadId !== null ? threadById.get(draft.threadId) : undefined
    return {
      draft,
      severity: draftSeverity(draft),
      certainty: draftCertainty(draft),
      authorKey: azureDevOpsReviewDraftAuthorKey(draft.author),
      filePath: draft.filePath ?? thread?.filePath ?? null,
      line: draft.anchor?.startLine ?? thread?.anchor?.startLine ?? null,
      createdAt: draft.createdAt
    }
  })
}

/** Files in the order of the Files tab's tree, so sorting by file reads the same way. */
export function azureDevOpsReviewFileRank(
  changes: readonly AzureDevOpsReviewChange[]
): ReviewFindingFileRank {
  const entries = getCombinedDiffBranchEntriesInTreeOrder(
    'commit',
    changes.map(azureDevOpsChangeToBranchEntry)
  )
  return new Map(entries.map((entry, index) => [entry.path, index]))
}
