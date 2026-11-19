import { useMemo, useState } from 'react'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView
} from '../../../../shared/azure-devops-review-types'
import {
  EMPTY_REVIEW_FINDING_FILTER,
  filterReviewFindings,
  isReviewFindingSortOrder,
  reviewFindingFacets,
  sortReviewFindings,
  type ReviewFindingFacets,
  type ReviewFindingFilter,
  type ReviewFindingSortOrder
} from '../../../../shared/review-finding-list-view'
import {
  azureDevOpsReviewDraftListItems,
  azureDevOpsReviewFileRank,
  type AzureDevOpsReviewDraftListItem
} from './azure-devops-review-draft-list'

const SORT_ORDER_KEY = 'orca.azureDevOpsReview.draftsSortOrder'

function readSortOrder(): ReviewFindingSortOrder {
  try {
    const stored = localStorage.getItem(SORT_ORDER_KEY)
    return isReviewFindingSortOrder(stored) ? stored : 'priority'
  } catch {
    return 'priority'
  }
}

function storeSortOrder(order: ReviewFindingSortOrder): void {
  try {
    localStorage.setItem(SORT_ORDER_KEY, order)
  } catch {
    // Only a remembered preference; sorting by priority still works.
  }
}

export type AzureDevOpsReviewDraftList = {
  order: ReviewFindingSortOrder
  setOrder: (order: ReviewFindingSortOrder) => void
  filter: ReviewFindingFilter
  setFilter: (filter: ReviewFindingFilter) => void
  /** Drafts the filter keeps, in the chosen order. */
  shown: AzureDevOpsReviewDraftListItem[]
  hidden: AzureDevOpsReviewDraftListItem[]
  hiddenWithoutSeverity: number
  facets: ReviewFindingFacets
}

/**
 * Sorting and filtering of the unpublished drafts. The order is remembered like the Files view
 * mode; the filter lasts while the page is open, so a later visit never starts with drafts hidden.
 */
export function useAzureDevOpsReviewDraftList(
  detail: Pick<AzureDevOpsReviewDetail, 'threads' | 'changes'>,
  pending: readonly AzureDevOpsReviewDraftView[]
): AzureDevOpsReviewDraftList {
  const [order, setOrderState] = useState<ReviewFindingSortOrder>(readSortOrder)
  const [filter, setFilter] = useState<ReviewFindingFilter>(EMPTY_REVIEW_FINDING_FILTER)
  const fileRank = useMemo(() => azureDevOpsReviewFileRank(detail.changes), [detail.changes])
  const items = useMemo(
    () => azureDevOpsReviewDraftListItems(pending, detail.threads),
    [pending, detail.threads]
  )
  const sorted = useMemo(() => sortReviewFindings(items, order, fileRank), [items, order, fileRank])
  const { shown, hidden, hiddenWithoutSeverity } = useMemo(
    () => filterReviewFindings(sorted, filter),
    [sorted, filter]
  )
  const facets = useMemo(
    () => reviewFindingFacets(items, filter, fileRank),
    [items, filter, fileRank]
  )
  const setOrder = (next: ReviewFindingSortOrder): void => {
    setOrderState(next)
    storeSortOrder(next)
  }
  return { order, setOrder, filter, setFilter, shown, hidden, hiddenWithoutSeverity, facets }
}
