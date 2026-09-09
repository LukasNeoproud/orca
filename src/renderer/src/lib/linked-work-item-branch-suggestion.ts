import { getLinearLinkedWorkItemBranchName } from './linear-linked-work-item'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName
} from '../../../shared/workspace-name'
import type { LinkedWorkItemSummary } from './new-workspace'

export function getLinkedWorkItemBranchSuggestion(
  item: LinkedWorkItemSummary | null,
  branchNameOverride?: string
): string | undefined {
  if (!item) {
    return undefined
  }
  return (
    getLinearLinkedWorkItemBranchName(item) ??
    (item.type === 'pr' || item.type === 'mr' ? branchNameOverride : undefined) ??
    getLinkedWorkItemWorkspaceName(item)?.seedName ??
    getLinkedWorkItemSuggestedName(item)
  )
}
