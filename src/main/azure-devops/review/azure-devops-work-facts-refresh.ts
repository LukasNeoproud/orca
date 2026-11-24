import type { Repo } from '../../../shared/repo-types'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'
import { mapWithConcurrency } from '../../../shared/map-with-concurrency'
import { azureDevOpsOrganizationCredentialSource } from '../azure-devops-credentials'
import {
  azureDevOpsLastVersionAt,
  deriveAzureDevOpsPullRequestActivity
} from './azure-devops-pull-request-activity'
import {
  getAzureDevOpsReviewIdentity,
  listAzureDevOpsProjectPullRequestsByCreator,
  listAzureDevOpsReviewIterations,
  listAzureDevOpsReviewThreads,
  resolveAzureDevOpsReviewRepository
} from './azure-devops-review-client'
import {
  mapAzureDevOpsReviewPullRequest,
  type RawReviewPullRequest
} from './azure-devops-review-mappers'
import {
  collectAzureDevOpsReviewRepos,
  type AzureDevOpsReviewRepoSource
} from './azure-devops-review-repos'
import type { AzureDevOpsWorkFactsStore } from './azure-devops-work-facts-store'

/** Requests one round may spend on threads and iterations; what does not fit waits a round. */
export const AZURE_DEVOPS_WORK_FACTS_DETAIL_REQUESTS = 30
const OPEN_PAGE = 100
const COMPLETED_PAGE = 50
// Why a window: merged work is followed until it is released, not forever.
const COMPLETED_WITHIN_MS = 90 * 24 * 60 * 60_000
const CONCURRENCY = 4

export type AzureDevOpsWorkFactsRound = {
  /** Something could not be read, so the next round should come sooner. */
  failed: boolean
  detailRequests: number
  /** Open pull requests whose threads were left for a later round. */
  deferred: number
}

type Listed = {
  source: AzureDevOpsReviewRepoSource
  pullRequest: AzureDevOpsReviewPullRequest
  meId: string
}
type Project = { meId: string; sources: AzureDevOpsReviewRepoSource[] }

function fingerprintOf(pullRequest: AzureDevOpsReviewPullRequest): string {
  const votes = pullRequest.workFacts?.reviewers.map((reviewer) => reviewer.vote).join(',')
  return [pullRequest.sourceCommit, pullRequest.isDraft, votes].join('|')
}

/** Signed-in projects with their repositories; repositories that cannot be asked are recorded. */
async function projectsToRead(
  sources: readonly AzureDevOpsReviewRepoSource[],
  store: AzureDevOpsWorkFactsStore
): Promise<{ projects: Project[]; failed: boolean }> {
  const projects = new Map<string, Project>()
  const identities = new Map<string, string | null>()
  let failed = false
  for (const source of sources) {
    if (!azureDevOpsOrganizationCredentialSource(source.organizationKey)) {
      store.recordProblem(source.key, 'not-connected')
      continue
    }
    if (!identities.has(source.organizationKey)) {
      const identity = await getAzureDevOpsReviewIdentity(source).catch(() => null)
      identities.set(source.organizationKey, identity?.id ?? null)
    }
    const meId = identities.get(source.organizationKey)
    if (!meId) {
      store.recordProblem(source.key, 'source-failed')
      failed = true
      continue
    }
    const key = `${source.organizationKey}/${source.project}`.toLowerCase()
    const project = projects.get(key) ?? { meId, sources: [] }
    project.sources.push(source)
    projects.set(key, project)
  }
  return { projects: [...projects.values()], failed }
}

/** The user's open and recently completed pull requests of one project, in two requests. */
async function listProject(
  project: Project,
  store: AzureDevOpsWorkFactsStore,
  nowMs: number
): Promise<{ listed: Listed[]; failed: boolean }> {
  const byRepositoryId = new Map<string, { source: AzureDevOpsReviewRepoSource; webUrl: string }>()
  let failed = false
  for (const source of project.sources) {
    try {
      const repository = await resolveAzureDevOpsReviewRepository({
        ...source,
        repoKey: source.key
      })
      byRepositoryId.set(repository.id, { source, webUrl: repository.webUrl })
    } catch {
      store.recordProblem(source.key, 'source-failed')
      failed = true
    }
  }
  const [first] = project.sources
  if (byRepositoryId.size === 0) {
    return { listed: [], failed }
  }
  let raws: RawReviewPullRequest[]
  try {
    const query = { creatorId: project.meId }
    raws = (
      await Promise.all([
        listAzureDevOpsProjectPullRequestsByCreator(first, {
          ...query,
          status: 'active',
          top: OPEN_PAGE
        }),
        listAzureDevOpsProjectPullRequestsByCreator(first, {
          ...query,
          status: 'completed',
          top: COMPLETED_PAGE
        })
      ])
    ).flat()
  } catch {
    for (const { source } of byRepositoryId.values()) {
      store.recordProblem(source.key, 'source-failed')
    }
    return { listed: [], failed: true }
  }
  const listed: Listed[] = []
  for (const raw of raws) {
    const repositoryId = raw.repository?.id?.toLowerCase()
    const repository = repositoryId ? byRepositoryId.get(repositoryId) : undefined
    const pullRequest =
      repository && repositoryId
        ? mapAzureDevOpsReviewPullRequest(raw, {
            repo: repository.source,
            repositoryId,
            repositoryWebUrl: repository.webUrl,
            meId: project.meId
          })
        : null
    const closedMs = pullRequest?.closedAt ? Date.parse(pullRequest.closedAt) : nowMs
    if (repository && pullRequest && !(nowMs - closedMs > COMPLETED_WITHIN_MS)) {
      listed.push({ source: repository.source, pullRequest, meId: project.meId })
    }
  }
  for (const { source } of byRepositoryId.values()) {
    const ofRepo = listed.filter((entry) => entry.source.key === source.key)
    store.recordListing(
      source.key,
      ofRepo.map((entry) => entry.pullRequest),
      nowMs
    )
  }
  return { listed, failed }
}

/** New and changed pull requests first, then the ones read longest ago. */
function readingOrder(store: AzureDevOpsWorkFactsStore, open: readonly Listed[]): Listed[] {
  const rank = ({ pullRequest }: Listed): [number, number] => {
    const stored = store.storedActivity(pullRequest.key)
    if (!stored) {
      return [0, 0]
    }
    const changed = stored.fingerprint !== fingerprintOf(pullRequest)
    return [changed ? 1 : 2, Date.parse(stored.activity.readAt) || 0]
  }
  return [...open].sort((a, b) => {
    const [aRank, aRead] = rank(a)
    const [bRank, bRead] = rank(b)
    return aRank - bRank || aRead - bRead
  })
}

async function readActivity(
  { source, pullRequest, meId }: Listed,
  store: AzureDevOpsWorkFactsStore,
  needsIterations: boolean,
  nowMs: number
): Promise<void> {
  const target = {
    ...source,
    repositoryId: pullRequest.repositoryId,
    pullRequestId: pullRequest.pullRequestId
  }
  const stored = store.storedActivity(pullRequest.key)
  const [threads, iterations] = await Promise.all([
    listAzureDevOpsReviewThreads(target),
    needsIterations ? listAzureDevOpsReviewIterations(target) : null
  ])
  store.recordActivity(pullRequest.key, {
    sourceCommit: pullRequest.sourceCommit,
    fingerprint: fingerprintOf(pullRequest),
    activity: deriveAzureDevOpsPullRequestActivity({
      threads,
      lastVersionAt: iterations
        ? azureDevOpsLastVersionAt(iterations)
        : (stored?.activity.lastVersionAt ?? null),
      meId,
      readAt: new Date(nowMs).toISOString()
    })
  })
}

/**
 * One round of the background refresh: lists the pull requests the signed-in user created and
 * reads the threads of the open ones. Sends reads only.
 */
export async function refreshAzureDevOpsWorkFacts(
  host: { listRepos: () => Repo[] },
  store: AzureDevOpsWorkFactsStore,
  options: { detailRequests?: number; nowMs?: number } = {}
): Promise<AzureDevOpsWorkFactsRound> {
  const nowMs = options.nowMs ?? Date.now()
  const sources = await collectAzureDevOpsReviewRepos(host.listRepos())
  store.keepRepos(new Set(sources.map((source) => source.key)))
  const { projects, failed: unsigned } = await projectsToRead(sources, store)
  const lists = await mapWithConcurrency(projects, CONCURRENCY, (project) =>
    listProject(project, store, nowMs)
  )
  let failed = unsigned || lists.some((list) => list.failed)

  // Why not drafts: nobody is asked to review a draft, so its threads decide nothing.
  const open = lists
    .flatMap((list) => list.listed)
    .filter(({ pullRequest }) => pullRequest.status === 'active' && !pullRequest.isDraft)
  let budget = options.detailRequests ?? AZURE_DEVOPS_WORK_FACTS_DETAIL_REQUESTS
  let detailRequests = 0
  const planned: { entry: Listed; needsIterations: boolean }[] = []
  for (const entry of readingOrder(store, open)) {
    const stored = store.storedActivity(entry.pullRequest.key)
    // Why only then: a version is dated by its iteration, and an unchanged source commit has none new.
    const needsIterations = !stored || stored.sourceCommit !== entry.pullRequest.sourceCommit
    const cost = needsIterations ? 2 : 1
    if (cost > budget) {
      break
    }
    budget -= cost
    detailRequests += cost
    planned.push({ entry, needsIterations })
  }
  await mapWithConcurrency(planned, CONCURRENCY, async ({ entry, needsIterations }) => {
    try {
      await readActivity(entry, store, needsIterations, nowMs)
    } catch {
      failed = true
    }
  })
  // Why only after a full listing: a project that failed to list must not lose what was read.
  if (!failed) {
    store.keepActivities(new Set(open.map((entry) => entry.pullRequest.key)))
  }
  store.notifyChanged()
  return { failed, detailRequests, deferred: open.length - planned.length }
}
