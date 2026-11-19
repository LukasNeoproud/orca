import {
  AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE,
  clampAzureDevOpsReviewListPages
} from '../../../shared/azure-devops-review-list-pages'
import type { AzureDevOpsPullRequestStatusFilter } from '../../../shared/azure-devops-review-types'
import {
  listAzureDevOpsRepositoryPullRequests,
  type AzureDevOpsReviewTarget
} from './azure-devops-review-client'
import type { RawReviewPullRequest } from './azure-devops-review-mappers'

// Why: open pull requests are the work at hand, so they are read whole without being asked for.
const ACTIVE_PAGES = 10

export type AzureDevOpsReviewPullRequestPages = {
  pullRequests: RawReviewPullRequest[]
  /** Azure DevOps has, or may have, more pull requests than `pullRequests`. */
  truncated: boolean
  /** Why a later page is missing; the pages before it are still in `pullRequests`. */
  error: unknown
}

type RepositoryTarget = AzureDevOpsReviewTarget & { repositoryId: string }

async function readPages(
  target: RepositoryTarget,
  status: AzureDevOpsPullRequestStatusFilter,
  limit: number
): Promise<AzureDevOpsReviewPullRequestPages> {
  const pullRequests: RawReviewPullRequest[] = []
  for (let page = 0; page < limit; page++) {
    let batch: RawReviewPullRequest[]
    try {
      batch = await listAzureDevOpsRepositoryPullRequests(target, status, {
        top: AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE,
        skip: page * AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE
      })
    } catch (error) {
      if (page === 0) {
        throw error
      }
      return { pullRequests, truncated: true, error }
    }
    pullRequests.push(...batch)
    if (batch.length < AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE) {
      return { pullRequests, truncated: false, error: null }
    }
  }
  return { pullRequests, truncated: true, error: null }
}

// Why: a pull request created between two requests shifts the pages and repeats an entry.
function uniqueById(pullRequests: readonly RawReviewPullRequest[]): RawReviewPullRequest[] {
  const seen = new Set<number>()
  return pullRequests.filter((pullRequest) => {
    const id = pullRequest.pullRequestId
    if (typeof id !== 'number') {
      return true
    }
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

/**
 * A repository's pull requests in `status`, newest first as Azure DevOps orders them. Open ones
 * are read to the end; closed ones only as far as `pages` asks, because their history is long.
 */
export async function listAzureDevOpsReviewPullRequestPages(
  target: RepositoryTarget,
  status: AzureDevOpsPullRequestStatusFilter,
  pages?: number
): Promise<AzureDevOpsReviewPullRequestPages> {
  const requested = clampAzureDevOpsReviewListPages(pages)
  // Why `- 1 + requested`: asking for more also moves past the limit of open pull requests.
  const active =
    status === 'active' || status === 'all'
      ? await readPages(target, 'active', ACTIVE_PAGES - 1 + requested)
      : null
  if (status === 'active' && active) {
    return { ...active, pullRequests: uniqueById(active.pullRequests) }
  }
  // Why a second query for `all`: its newest page can be filled by closed pull requests alone.
  const listed = await readPages(target, status, requested)
  return {
    pullRequests: uniqueById([...(active?.pullRequests ?? []), ...listed.pullRequests]),
    truncated: listed.truncated || active?.truncated === true,
    error: listed.error ?? active?.error ?? null
  }
}
