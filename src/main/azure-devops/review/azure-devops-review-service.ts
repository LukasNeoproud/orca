import type { Repo } from '../../../shared/repo-types'
import {
  parseAzureDevOpsPullRequestKey,
  type AzureDevOpsPullRequestStatusFilter,
  type AzureDevOpsReviewDetail,
  type AzureDevOpsReviewDraftView,
  type AzureDevOpsReviewIteration,
  type AzureDevOpsReviewListError,
  type AzureDevOpsReviewListResult,
  type AzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewWorktreeInfo
} from '../../../shared/azure-devops-review-types'
import { azureDevOpsOrganizationCredentialSource } from '../azure-devops-credentials'
import {
  collectAzureDevOpsReviewRepos,
  toAzureDevOpsReviewRepo,
  type AzureDevOpsReviewRepoSource
} from './azure-devops-review-repos'
import {
  getAzureDevOpsReviewIdentity,
  getAzureDevOpsReviewPullRequest,
  listAzureDevOpsReviewerPullRequests,
  listAzureDevOpsReviewIterationChanges,
  listAzureDevOpsReviewIterations,
  listAzureDevOpsReviewThreads,
  resolveAzureDevOpsReviewRepository,
  type AzureDevOpsPullRequestTarget
} from './azure-devops-review-client'
import {
  mapAzureDevOpsReviewChange,
  mapAzureDevOpsReviewIteration,
  mapAzureDevOpsReviewPullRequest,
  mapAzureDevOpsReviewThread
} from './azure-devops-review-mappers'
import {
  sortAzureDevOpsReviewDrafts,
  toAzureDevOpsReviewDraftView
} from './azure-devops-review-drafts'
import {
  countUnpublishedAzureDevOpsReviewDrafts,
  listStoredAzureDevOpsReviewDrafts
} from './azure-devops-review-draft-store'

const LIST_CONCURRENCY = 4

/** Newest first across repos and orgs; PR ids break ties within one repository. */
export function compareAzureDevOpsReviewPullRequestsNewestFirst(
  a: AzureDevOpsReviewPullRequest,
  b: AzureDevOpsReviewPullRequest
): number {
  const byDate = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  return byDate !== 0 ? byDate : b.pullRequestId - a.pullRequestId
}

export type AzureDevOpsReviewHost = {
  listRepos: () => Repo[]
  /** Review worktree currently registered for a repo, if any. */
  findReviewWorktree?: (repoKey: string) => AzureDevOpsReviewWorktreeInfo | null
}

export type AzureDevOpsResolvedPullRequest = {
  source: AzureDevOpsReviewRepoSource
  target: AzureDevOpsPullRequestTarget
  repositoryWebUrl: string
}

export function describeAzureDevOpsReviewError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function repoScope(source: AzureDevOpsReviewRepoSource): string {
  return `${source.organizationLabel}/${source.project}/${source.repository}`
}

export async function listAzureDevOpsReviewRepos(host: AzureDevOpsReviewHost) {
  return (await collectAzureDevOpsReviewRepos(host.listRepos())).map(toAzureDevOpsReviewRepo)
}

export async function listAzureDevOpsReviewPullRequests(
  host: AzureDevOpsReviewHost,
  status: AzureDevOpsPullRequestStatusFilter = 'active'
): Promise<AzureDevOpsReviewListResult> {
  const sources = await collectAzureDevOpsReviewRepos(host.listRepos())
  const errors: AzureDevOpsReviewListError[] = []
  const identities = new Map<string, string>()
  const organizations = new Map(sources.map((source) => [source.organizationKey, source]))
  for (const [organizationKey, source] of organizations) {
    if (!azureDevOpsOrganizationCredentialSource(organizationKey)) {
      errors.push({
        scope: source.organizationLabel,
        message: 'Connect this organization in Settings > Integrations > Azure DevOps.'
      })
      continue
    }
    try {
      identities.set(organizationKey, (await getAzureDevOpsReviewIdentity(source)).id)
    } catch (error) {
      errors.push({
        scope: source.organizationLabel,
        message: describeAzureDevOpsReviewError(error)
      })
    }
  }

  const perRepo = await mapWithConcurrency(sources, LIST_CONCURRENCY, async (source) => {
    const reviewerId = identities.get(source.organizationKey)
    if (!reviewerId) {
      return []
    }
    try {
      const repository = await resolveAzureDevOpsReviewRepository({
        ...source,
        repoKey: source.key
      })
      const raw = await listAzureDevOpsReviewerPullRequests(
        { ...source, repositoryId: repository.id, reviewerId },
        status
      )
      return raw
        .map((pr) =>
          mapAzureDevOpsReviewPullRequest(pr, {
            repo: source,
            repositoryId: repository.id,
            repositoryWebUrl: repository.webUrl,
            meId: reviewerId
          })
        )
        .filter((pr): pr is AzureDevOpsReviewPullRequest => pr !== null)
    } catch (error) {
      errors.push({ scope: repoScope(source), message: describeAzureDevOpsReviewError(error) })
      return []
    }
  })

  const pullRequests = perRepo.flat().sort(compareAzureDevOpsReviewPullRequestsNewestFirst)
  return {
    pullRequests,
    repos: sources.map(toAzureDevOpsReviewRepo),
    errors,
    draftCounts: countUnpublishedAzureDevOpsReviewDrafts(),
    fetchedAt: Date.now()
  }
}

export async function resolveAzureDevOpsReviewPullRequest(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string
): Promise<AzureDevOpsResolvedPullRequest> {
  const parsed = parseAzureDevOpsPullRequestKey(pullRequestKey)
  if (!parsed) {
    throw new Error(`Invalid pull request key: ${pullRequestKey}`)
  }
  const sources = (await collectAzureDevOpsReviewRepos(host.listRepos())).filter(
    (source) => source.organizationKey === parsed.organizationKey
  )
  for (const source of sources) {
    try {
      const repository = await resolveAzureDevOpsReviewRepository({
        ...source,
        repoKey: source.key
      })
      if (repository.id === parsed.repositoryId) {
        return {
          source,
          repositoryWebUrl: repository.webUrl,
          target: { ...source, repositoryId: repository.id, pullRequestId: parsed.pullRequestId }
        }
      }
    } catch {
      // Try the remaining repositories of the organization.
    }
  }
  throw new Error('The pull request belongs to a repository that is not added to Orca.')
}

export function latestAzureDevOpsReviewIteration(
  iterations: readonly AzureDevOpsReviewIteration[]
): AzureDevOpsReviewIteration | null {
  return iterations.reduce<AzureDevOpsReviewIteration | null>(
    (latest, iteration) => (!latest || iteration.id > latest.id ? iteration : latest),
    null
  )
}

export async function loadAzureDevOpsReviewIterations(target: AzureDevOpsPullRequestTarget) {
  return (await listAzureDevOpsReviewIterations(target))
    .map(mapAzureDevOpsReviewIteration)
    .filter((iteration): iteration is AzureDevOpsReviewIteration => iteration !== null)
}

export function azureDevOpsReviewDraftViews(
  pullRequestKey: string,
  latest: AzureDevOpsReviewIteration | null
): AzureDevOpsReviewDraftView[] {
  return sortAzureDevOpsReviewDrafts(listStoredAzureDevOpsReviewDrafts(pullRequestKey)).map(
    (draft) => toAzureDevOpsReviewDraftView(draft, latest)
  )
}

export async function getAzureDevOpsReviewDetail(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string
): Promise<AzureDevOpsReviewDetail> {
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, pullRequestKey)
  const identity = await getAzureDevOpsReviewIdentity(resolved.source).catch(() => null)
  const [rawPullRequest, iterations, rawThreads] = await Promise.all([
    getAzureDevOpsReviewPullRequest(resolved.target),
    loadAzureDevOpsReviewIterations(resolved.target),
    listAzureDevOpsReviewThreads(resolved.target)
  ])
  const pullRequest = mapAzureDevOpsReviewPullRequest(rawPullRequest, {
    repo: resolved.source,
    repositoryId: resolved.target.repositoryId,
    repositoryWebUrl: resolved.repositoryWebUrl,
    meId: identity?.id ?? null
  })
  if (!pullRequest) {
    throw new Error('Azure DevOps returned an unreadable pull request.')
  }
  const latest = latestAzureDevOpsReviewIteration(iterations)
  const changes = latest
    ? (await listAzureDevOpsReviewIterationChanges(resolved.target, latest.id))
        .map(mapAzureDevOpsReviewChange)
        .filter((change) => change !== null)
    : []
  return {
    pullRequest,
    latestIteration: latest,
    threads: rawThreads
      .map(mapAzureDevOpsReviewThread)
      .filter((thread) => thread !== null)
      .sort((a, b) => a.id - b.id),
    changes,
    drafts: azureDevOpsReviewDraftViews(pullRequestKey, latest),
    reviewWorktree: host.findReviewWorktree?.(resolved.source.key) ?? null
  }
}
