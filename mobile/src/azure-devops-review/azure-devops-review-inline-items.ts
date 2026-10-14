import type {
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewThread
} from '../../../src/shared/azure-devops-review-types'

type InlineThread = Pick<AzureDevOpsReviewThread, 'filePath' | 'anchor'>
type InlineDraft = Pick<AzureDevOpsReviewDraftView, 'state' | 'kind' | 'filePath' | 'anchor'>

export type ReviewInlineItems<
  TThread extends InlineThread = AzureDevOpsReviewThread,
  TDraft extends InlineDraft = AzureDevOpsReviewDraftView
> = {
  threads: TThread[]
  drafts: TDraft[]
}

/** `side:line` of the line a comment shows under: its last line, as in Azure DevOps. */
export function reviewInlineLineKey(anchor: { side: string; endLine: number }): string {
  return `${anchor.side}:${anchor.endLine}`
}

/** Line-anchored threads and unpublished drafts of one file, keyed by reviewInlineLineKey. */
export function azureDevOpsReviewInlineItems<
  TThread extends InlineThread,
  TDraft extends InlineDraft
>(
  detail: { threads: readonly TThread[]; drafts: readonly TDraft[] },
  path: string
): Map<string, ReviewInlineItems<TThread, TDraft>> {
  const byLine = new Map<string, ReviewInlineItems<TThread, TDraft>>()
  const at = (key: string): ReviewInlineItems<TThread, TDraft> => {
    let items = byLine.get(key)
    if (!items) {
      items = { threads: [], drafts: [] }
      byLine.set(key, items)
    }
    return items
  }
  for (const thread of detail.threads) {
    if (thread.filePath === path && thread.anchor) {
      at(reviewInlineLineKey(thread.anchor)).threads.push(thread)
    }
  }
  for (const draft of detail.drafts) {
    if (
      draft.state !== 'published' &&
      draft.kind === 'inline' &&
      draft.filePath === path &&
      draft.anchor
    ) {
      at(reviewInlineLineKey(draft.anchor)).drafts.push(draft)
    }
  }
  return byLine
}
