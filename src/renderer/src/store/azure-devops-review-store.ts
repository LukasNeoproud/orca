import { create } from 'zustand'
import {
  DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
  reconcileAzureDevOpsReviewFilters,
  type AzureDevOpsReviewFilters
} from '../../../shared/azure-devops-review-filters'
import { isReviewInvolvementFilter } from '../../../shared/azure-devops-review-groups'
import { AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES } from '../../../shared/azure-devops-review-list-pages'
import type { AzureDevOpsReviewListResult } from '../../../shared/azure-devops-review-types'
import { listAzureDevOpsReviewPullRequests } from '@/lib/azure-devops-review-client'

const FILTERS_STORAGE_KEY = 'orca.azureDevOpsReview.filters'

type AzureDevOpsReviewState = {
  filters: AzureDevOpsReviewFilters
  list: AzureDevOpsReviewListResult | null
  loading: boolean
  error: string | null
  /** Pages of closed pull requests the list reads per repository; grows when the user asks. */
  pages: number
  /** Pull request shown on the workbench detail page. */
  openPullRequestKey: string | null
  /** Orca projects the panel last saw; adding or removing one makes the list stale. */
  projectsSignature: string | null
  /** Records the current projects; true when they differ from ones seen before. */
  noteProjects: (signature: string) => boolean
  setFilters: (patch: Partial<AzureDevOpsReviewFilters>) => void
  refresh: () => Promise<void>
  /** Reads one more page of every repository; does nothing once the limit is reached. */
  loadMore: () => Promise<void>
  openPullRequest: (key: string) => void
  closePullRequest: () => void
}

function readStoredFilters(): AzureDevOpsReviewFilters {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<AzureDevOpsReviewFilters>) : null
    if (!parsed) {
      return DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS
    }
    return {
      project: typeof parsed.project === 'string' ? parsed.project : 'all',
      repo: typeof parsed.repo === 'string' ? parsed.repo : 'all',
      status:
        parsed.status === 'completed' ||
        parsed.status === 'abandoned' ||
        parsed.status === 'all' ||
        parsed.status === 'active'
          ? parsed.status
          : 'active',
      // Why: a search is a momentary lookup, not a remembered preference.
      query: '',
      involvement: isReviewInvolvementFilter(parsed.involvement) ? parsed.involvement : 'all'
    }
  } catch {
    return DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS
  }
}

function storeFilters(filters: AzureDevOpsReviewFilters): void {
  try {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        project: filters.project,
        repo: filters.repo,
        status: filters.status,
        involvement: filters.involvement
      })
    )
  } catch {
    // Remembering filters is a convenience only.
  }
}

let refreshGeneration = 0

export function azureDevOpsReviewProjectsSignature(repos: readonly { id: string }[]): string {
  return repos
    .map((repo) => repo.id)
    .sort()
    .join('\n')
}

export const useAzureDevOpsReviewStore = create<AzureDevOpsReviewState>((set, get) => ({
  filters: readStoredFilters(),
  list: null,
  loading: false,
  error: null,
  pages: 1,
  openPullRequestKey: null,
  projectsSignature: null,
  noteProjects: (signature) => {
    const previous = get().projectsSignature
    if (previous === signature) {
      return false
    }
    set({ projectsSignature: signature })
    return previous !== null
  },
  setFilters: (patch) => {
    const previous = get().filters
    const filters = { ...previous, ...patch }
    const statusChanged = patch.status !== undefined && patch.status !== previous.status
    // Why: the depth was asked for in the previous status's history.
    set(statusChanged ? { filters, pages: 1 } : { filters })
    storeFilters(filters)
    if (statusChanged) {
      void get().refresh()
    }
  },
  refresh: async () => {
    const generation = ++refreshGeneration
    set({ loading: true, error: null })
    try {
      const list = await listAzureDevOpsReviewPullRequests(get().filters.status, get().pages)
      if (generation !== refreshGeneration) {
        return
      }
      const filters = reconcileAzureDevOpsReviewFilters(get().filters, list.repos)
      set({ list, filters, loading: false })
    } catch (error) {
      if (generation === refreshGeneration) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
  },
  loadMore: async () => {
    const { pages, refresh } = get()
    if (pages >= AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES) {
      return
    }
    set({ pages: pages + 1 })
    await refresh()
  },
  openPullRequest: (key) => set({ openPullRequestKey: key }),
  closePullRequest: () => set({ openPullRequestKey: null })
}))
