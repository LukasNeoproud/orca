import type {
  AzureDevOpsPullRequestStatusFilter,
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewRepo
} from './azure-devops-review-types'

export const AZURE_DEVOPS_REVIEW_ALL = 'all'

export type AzureDevOpsReviewFilters = {
  /** `${organizationKey}/${project}` lowercased, or 'all'. */
  project: string
  /** Repo key, or 'all'. */
  repo: string
  status: AzureDevOpsPullRequestStatusFilter
  query: string
}

export const DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS: AzureDevOpsReviewFilters = {
  project: AZURE_DEVOPS_REVIEW_ALL,
  repo: AZURE_DEVOPS_REVIEW_ALL,
  status: 'active',
  query: ''
}

export function azureDevOpsReviewProjectKey(organizationKey: string, project: string): string {
  return `${organizationKey}/${project}`.toLowerCase()
}

export type AzureDevOpsReviewFilterOption = { value: string; label: string }

/** Projects and repos to filter by; org labels appear only when several orgs are tracked. */
export function azureDevOpsReviewFilterOptions(
  repos: readonly AzureDevOpsReviewRepo[],
  selectedProject: string
): { projects: AzureDevOpsReviewFilterOption[]; repos: AzureDevOpsReviewFilterOption[] } {
  const multipleOrgs = new Set(repos.map((repo) => repo.organizationKey)).size > 1
  const projects = new Map<string, string>()
  for (const repo of repos) {
    projects.set(
      azureDevOpsReviewProjectKey(repo.organizationKey, repo.project),
      multipleOrgs ? `${repo.organizationLabel} / ${repo.project}` : repo.project
    )
  }
  const repoOptions = repos
    .filter(
      (repo) =>
        selectedProject === AZURE_DEVOPS_REVIEW_ALL ||
        azureDevOpsReviewProjectKey(repo.organizationKey, repo.project) === selectedProject
    )
    .map((repo) => ({ value: repo.key, label: repo.repository }))
  return {
    projects: [...projects.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    repos: repoOptions.sort((a, b) => a.label.localeCompare(b.label))
  }
}

export function filterAzureDevOpsReviewPullRequests(
  pullRequests: readonly AzureDevOpsReviewPullRequest[],
  filters: AzureDevOpsReviewFilters
): AzureDevOpsReviewPullRequest[] {
  const needle = filters.query.trim().toLocaleLowerCase()
  return pullRequests.filter((pr) => {
    if (
      filters.project !== AZURE_DEVOPS_REVIEW_ALL &&
      azureDevOpsReviewProjectKey(pr.organizationKey, pr.project) !== filters.project
    ) {
      return false
    }
    if (filters.repo !== AZURE_DEVOPS_REVIEW_ALL && pr.repoKey !== filters.repo) {
      return false
    }
    if (filters.status !== 'all' && pr.status !== filters.status) {
      return false
    }
    if (!needle) {
      return true
    }
    return `${pr.pullRequestId} ${pr.title} ${pr.author.displayName} ${pr.repository} ${pr.sourceBranch}`
      .toLocaleLowerCase()
      .includes(needle)
  })
}

/** Drops project/repo selections that no longer exist (e.g. a repo was removed from Orca). */
export function reconcileAzureDevOpsReviewFilters(
  filters: AzureDevOpsReviewFilters,
  repos: readonly AzureDevOpsReviewRepo[]
): AzureDevOpsReviewFilters {
  const projectKeys = new Set(
    repos.map((repo) => azureDevOpsReviewProjectKey(repo.organizationKey, repo.project))
  )
  const project =
    filters.project === AZURE_DEVOPS_REVIEW_ALL || projectKeys.has(filters.project)
      ? filters.project
      : AZURE_DEVOPS_REVIEW_ALL
  const repoMatches = repos.some(
    (repo) =>
      repo.key === filters.repo &&
      (project === AZURE_DEVOPS_REVIEW_ALL ||
        azureDevOpsReviewProjectKey(repo.organizationKey, repo.project) === project)
  )
  const repo =
    filters.repo === AZURE_DEVOPS_REVIEW_ALL || repoMatches ? filters.repo : AZURE_DEVOPS_REVIEW_ALL
  return project === filters.project && repo === filters.repo
    ? filters
    : { ...filters, project, repo }
}

export function isDefaultAzureDevOpsReviewFilters(filters: AzureDevOpsReviewFilters): boolean {
  return (
    filters.project === DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS.project &&
    filters.repo === DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS.repo &&
    filters.status === DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS.status &&
    !filters.query.trim()
  )
}
