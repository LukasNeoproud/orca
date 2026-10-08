import { create } from 'zustand'
import {
  DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
  reconcileAzureDevOpsReviewFilters,
  type AzureDevOpsReviewFilters
} from '../../../shared/azure-devops-review-filters'
import type { AzureDevOpsReviewListResult } from '../../../shared/azure-devops-review-types'
import { listAzureDevOpsReviewPullRequests } from '@/lib/azure-devops-review-client'

const FILTERS_STORAGE_KEY = 'orca.azureDevOpsReview.filters'

type AzureDevOpsReviewState = {
  filters: AzureDevOpsReviewFilters
  list: AzureDevOpsReviewListResult | null
  loading: boolean
  error: string | null
  /** Pull request shown on the workbench detail page. */
  openPullRequestKey: string | null
  setFilters: (patch: Partial<AzureDevOpsReviewFilters>) => void
  refresh: () => Promise<void>
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
      query: ''
    }
  } catch {
    return DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS
  }
}

function storeFilters(filters: AzureDevOpsReviewFilters): void {
  try {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({ project: filters.project, repo: filters.repo, status: filters.status })
    )
  } catch {
    // Remembering filters is a convenience only.
  }
}

let refreshGeneration = 0

export const useAzureDevOpsReviewStore = create<AzureDevOpsReviewState>((set, get) => ({
  filters: readStoredFilters(),
  list: null,
  loading: false,
  error: null,
  openPullRequestKey: null,
  setFilters: (patch) => {
    const previous = get().filters
    const filters = { ...previous, ...patch }
    set({ filters })
    storeFilters(filters)
    if (patch.status !== undefined && patch.status !== previous.status) {
      void get().refresh()
    }
  },
  refresh: async () => {
    const generation = ++refreshGeneration
    set({ loading: true, error: null })
    try {
      const list = await listAzureDevOpsReviewPullRequests(get().filters.status)
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
  openPullRequest: (key) => set({ openPullRequestKey: key }),
  closePullRequest: () => set({ openPullRequestKey: null })
}))
