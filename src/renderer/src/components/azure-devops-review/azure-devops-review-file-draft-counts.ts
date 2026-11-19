import type { AzureDevOpsReviewDraft } from '../../../../shared/azure-devops-review-types'

export type AzureDevOpsReviewFileDraftCount = {
  /** Unpublished drafts on the file, the agent's included. */
  total: number
  agent: number
}

/** Unpublished drafts per file path; replies and general drafts carry no file and are skipped. */
export function countAzureDevOpsReviewFileDrafts(
  drafts: readonly Pick<AzureDevOpsReviewDraft, 'filePath' | 'state' | 'author'>[]
): ReadonlyMap<string, AzureDevOpsReviewFileDraftCount> {
  const counts = new Map<string, AzureDevOpsReviewFileDraftCount>()
  for (const draft of drafts) {
    if (!draft.filePath || draft.state === 'published') {
      continue
    }
    const count = counts.get(draft.filePath) ?? { total: 0, agent: 0 }
    count.total += 1
    if (draft.author.kind === 'agent') {
      count.agent += 1
    }
    counts.set(draft.filePath, count)
  }
  return counts
}
