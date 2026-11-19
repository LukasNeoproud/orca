import {
  REVIEW_FINDING_CERTAINTIES,
  REVIEW_FINDING_SEVERITIES,
  type ReviewFindingCertainty,
  type ReviewFindingSeverity
} from './review-finding'
import { deriveReviewFindingPriority } from './review-finding-priority'

/** A finding as a list sorts and filters it, whatever review provider or tool it comes from. */
export type ReviewFindingListItem = {
  severity: ReviewFindingSeverity | null
  certainty: ReviewFindingCertainty | null
  /** Who wrote it, as a key the author filter compares. */
  authorKey: string
  /** The file it is about; null for a comment on the whole change. */
  filePath: string | null
  /** First line it comments; null when it comments no line. */
  line: number | null
  createdAt: number
}

export const REVIEW_FINDING_SORT_ORDERS = ['priority', 'file'] as const
export type ReviewFindingSortOrder = (typeof REVIEW_FINDING_SORT_ORDERS)[number]

export function isReviewFindingSortOrder(value: unknown): value is ReviewFindingSortOrder {
  return REVIEW_FINDING_SORT_ORDERS.some((order) => order === value)
}

/** Stands for "not set" among the severities and certainties a filter takes. */
export const REVIEW_FINDING_UNRATED = 'none'
export type ReviewFindingSeverityFilterValue = ReviewFindingSeverity | typeof REVIEW_FINDING_UNRATED
export type ReviewFindingCertaintyFilterValue =
  | ReviewFindingCertainty
  | typeof REVIEW_FINDING_UNRATED

export const REVIEW_FINDING_SEVERITY_FILTER_VALUES: readonly ReviewFindingSeverityFilterValue[] = [
  ...REVIEW_FINDING_SEVERITIES,
  REVIEW_FINDING_UNRATED
]
export const REVIEW_FINDING_CERTAINTY_FILTER_VALUES: readonly ReviewFindingCertaintyFilterValue[] =
  [...REVIEW_FINDING_CERTAINTIES, REVIEW_FINDING_UNRATED]

/** Each list keeps the findings that match one of its values; an empty list keeps them all. */
export type ReviewFindingFilter = {
  severities: readonly ReviewFindingSeverityFilterValue[]
  certainties: readonly ReviewFindingCertaintyFilterValue[]
  authorKeys: readonly string[]
  /** null stands for findings on no file. */
  filePaths: readonly (string | null)[]
}

export const EMPTY_REVIEW_FINDING_FILTER: ReviewFindingFilter = {
  severities: [],
  certainties: [],
  authorKeys: [],
  filePaths: []
}

/** How many of the filter's lists narrow the findings. */
export function countReviewFindingFilters(filter: ReviewFindingFilter): number {
  return [filter.severities, filter.certainties, filter.authorKeys, filter.filePaths].filter(
    (values) => values.length > 0
  ).length
}

function keeps<T>(values: readonly T[], value: T): boolean {
  return values.length === 0 || values.includes(value)
}

export function matchesReviewFindingFilter(
  item: ReviewFindingListItem,
  filter: ReviewFindingFilter
): boolean {
  return (
    keeps(filter.severities, item.severity ?? REVIEW_FINDING_UNRATED) &&
    keeps(filter.certainties, item.certainty ?? REVIEW_FINDING_UNRATED) &&
    keeps(filter.authorKeys, item.authorKey) &&
    keeps(filter.filePaths, item.filePath)
  )
}

export type ReviewFindingFilterResult<T> = {
  shown: T[]
  hidden: T[]
  /** Hidden findings without a severity, such as drafts written by hand. */
  hiddenWithoutSeverity: number
}

/** Splits findings by the filter, keeping their order. */
export function filterReviewFindings<T extends ReviewFindingListItem>(
  items: readonly T[],
  filter: ReviewFindingFilter
): ReviewFindingFilterResult<T> {
  const shown: T[] = []
  const hidden: T[] = []
  for (const item of items) {
    ;(matchesReviewFindingFilter(item, filter) ? shown : hidden).push(item)
  }
  return {
    shown,
    hidden,
    hiddenWithoutSeverity: hidden.filter((item) => item.severity === null).length
  }
}

/** Position of each file in the change, as its file list shows them. */
export type ReviewFindingFileRank = ReadonlyMap<string, number>

const NO_FILE_RANK: ReviewFindingFileRank = new Map()

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Findings on no file first, then files in the change's order, then other files by path. */
function compareFiles(a: string | null, b: string | null, fileRank: ReviewFindingFileRank): number {
  if (a === b) {
    return 0
  }
  if (a === null || b === null) {
    return a === null ? -1 : 1
  }
  const rankA = fileRank.get(a)
  const rankB = fileRank.get(b)
  if (rankA !== undefined && rankB !== undefined && rankA !== rankB) {
    return rankA - rankB
  }
  if ((rankA === undefined) !== (rankB === undefined)) {
    return rankA === undefined ? 1 : -1
  }
  return compareText(a, b)
}

function compareByFile(
  a: ReviewFindingListItem,
  b: ReviewFindingListItem,
  fileRank: ReviewFindingFileRank
): number {
  return (
    compareFiles(a.filePath, b.filePath, fileRank) ||
    // Why -1 for no line: a comment on the whole file comes before its lines.
    (a.line ?? -1) - (b.line ?? -1) ||
    a.createdAt - b.createdAt
  )
}

/** A sorted copy: by priority (highest first, then by file) or by file and line. */
export function sortReviewFindings<T extends ReviewFindingListItem>(
  items: readonly T[],
  order: ReviewFindingSortOrder,
  fileRank: ReviewFindingFileRank = NO_FILE_RANK
): T[] {
  if (order === 'file') {
    return [...items].sort((a, b) => compareByFile(a, b, fileRank))
  }
  const priority = new Map(items.map((item) => [item, deriveReviewFindingPriority(item)]))
  return [...items].sort(
    (a, b) => (priority.get(b) ?? 0) - (priority.get(a) ?? 0) || compareByFile(a, b, fileRank)
  )
}

/** How many findings carry each value a filter can take, in the order a menu lists them. */
export type ReviewFindingFacets = {
  severities: [ReviewFindingSeverityFilterValue, number][]
  certainties: [ReviewFindingCertaintyFilterValue, number][]
  authorKeys: [string, number][]
  filePaths: [string | null, number][]
}

function tally<T>(values: readonly T[], listed: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>(listed.map((value) => [value, 0]))
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/**
 * Every severity and certainty, and the authors and files the findings have. A value the filter
 * holds stays listed when no finding has it any more, so that it can still be cleared.
 */
export function reviewFindingFacets(
  items: readonly ReviewFindingListItem[],
  filter: ReviewFindingFilter,
  fileRank: ReviewFindingFileRank = NO_FILE_RANK
): ReviewFindingFacets {
  const severities = tally(
    items.map((item) => item.severity ?? REVIEW_FINDING_UNRATED),
    REVIEW_FINDING_SEVERITY_FILTER_VALUES
  )
  const certainties = tally(
    items.map((item) => item.certainty ?? REVIEW_FINDING_UNRATED),
    REVIEW_FINDING_CERTAINTY_FILTER_VALUES
  )
  const authorKeys = tally(
    items.map((item) => item.authorKey),
    filter.authorKeys
  )
  const filePaths = tally(
    items.map((item) => item.filePath),
    filter.filePaths
  )
  return {
    severities: [...severities],
    certainties: [...certainties],
    authorKeys: [...authorKeys].sort(([a], [b]) => compareText(a, b)),
    filePaths: [...filePaths].sort(([a], [b]) => compareFiles(a, b, fileRank))
  }
}
