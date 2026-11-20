import { randomUUID } from 'node:crypto'
import type {
  AzureDevOpsReviewDraftCreateInput,
  AzureDevOpsReviewDraftPatch,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewIteration,
  AzureDevOpsReviewPublishResult
} from '../../../shared/azure-devops-review-types'
import {
  azureDevOpsReviewDraftViews,
  describeAzureDevOpsReviewError,
  latestAzureDevOpsReviewIteration,
  loadAzureDevOpsReviewIterations,
  resolveAzureDevOpsReviewPullRequest,
  type AzureDevOpsResolvedPullRequest,
  type AzureDevOpsReviewHost
} from './azure-devops-review-service'
import { createAzureDevOpsReviewFileReader } from './azure-devops-review-file-line-cache'
import { describeAzureDevOpsReviewDraftFindings } from './azure-devops-review-draft-findings'
import { azureDevOpsReviewGateRunFacts } from './azure-devops-review-gate-run-evidence'
import {
  createAzureDevOpsReviewReply,
  createAzureDevOpsReviewThread,
  listAzureDevOpsReviewIterationChanges,
  listAzureDevOpsReviewThreads,
  updateAzureDevOpsReviewThreadStatus
} from './azure-devops-review-client'
import {
  azureDevOpsThreadStatusToWire,
  buildAzureDevOpsThreadPayload
} from './azure-devops-review-thread-payload'
import {
  mapAzureDevOpsReviewChange,
  mapAzureDevOpsReviewThread
} from './azure-devops-review-mappers'
import {
  applyAzureDevOpsReviewDraftPatch,
  AzureDevOpsReviewDraftError,
  buildAzureDevOpsReviewDraft,
  isAzureDevOpsReviewDraftOutdated,
  toAzureDevOpsReviewDraftView
} from './azure-devops-review-drafts'
import type { AzureDevOpsReviewCastableVote } from '../../../shared/azure-devops-review-vote'
import {
  castAzureDevOpsReviewVoteAfterDrafts,
  resolveAzureDevOpsReviewVoter
} from './azure-devops-review-vote-cast'
import {
  deleteStoredAzureDevOpsReviewDraft,
  getStoredAzureDevOpsReviewDraft,
  putStoredAzureDevOpsReviewDraft
} from './azure-devops-review-draft-store'

/** Draft views with the host's checks of their evidence, read through one request budget. */
function withFindings(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string,
  resolved: AzureDevOpsResolvedPullRequest,
  iterations: readonly AzureDevOpsReviewIteration[],
  drafts: readonly AzureDevOpsReviewDraftView[]
): Promise<AzureDevOpsReviewDraftView[]> {
  return describeAzureDevOpsReviewDraftFindings({
    drafts,
    iterations,
    gateRuns: azureDevOpsReviewGateRunFacts(host, resolved.source.key, pullRequestKey),
    readFile: createAzureDevOpsReviewFileReader({
      ...resolved.source,
      repositoryId: resolved.target.repositoryId
    })
  })
}

export async function listAzureDevOpsReviewDrafts(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string
): Promise<{
  drafts: AzureDevOpsReviewDraftView[]
  latestIteration: AzureDevOpsReviewIteration | null
}> {
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, pullRequestKey)
  const iterations = await loadAzureDevOpsReviewIterations(resolved.target)
  const latest = latestAzureDevOpsReviewIteration(iterations)
  return {
    drafts: await withFindings(
      host,
      pullRequestKey,
      resolved,
      iterations,
      azureDevOpsReviewDraftViews(pullRequestKey, latest)
    ),
    latestIteration: latest
  }
}

export async function createAzureDevOpsReviewDraft(
  host: AzureDevOpsReviewHost,
  input: AzureDevOpsReviewDraftCreateInput
): Promise<AzureDevOpsReviewDraftView> {
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, input.pullRequestKey)
  const iterations = await loadAzureDevOpsReviewIterations(resolved.target)
  const draft = buildAzureDevOpsReviewDraft(input, {
    id: randomUUID(),
    now: Date.now(),
    iterations
  })
  putStoredAzureDevOpsReviewDraft(draft)
  const view = toAzureDevOpsReviewDraftView(draft, latestAzureDevOpsReviewIteration(iterations))
  return (await withFindings(host, input.pullRequestKey, resolved, iterations, [view]))[0]
}

function requireDraft(id: string) {
  const draft = getStoredAzureDevOpsReviewDraft(id)
  if (!draft) {
    throw new AzureDevOpsReviewDraftError(`Draft ${id} does not exist.`)
  }
  return draft
}

export async function updateAzureDevOpsReviewDraft(
  host: AzureDevOpsReviewHost,
  id: string,
  patch: AzureDevOpsReviewDraftPatch
): Promise<AzureDevOpsReviewDraftView> {
  const draft = requireDraft(id)
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, draft.pullRequestKey)
  const iterations = await loadAzureDevOpsReviewIterations(resolved.target)
  const latest = latestAzureDevOpsReviewIteration(iterations)
  const next = applyAzureDevOpsReviewDraftPatch(draft, patch, {
    now: Date.now(),
    latestIteration: latest
  })
  putStoredAzureDevOpsReviewDraft(next)
  const view = toAzureDevOpsReviewDraftView(next, latest)
  return (await withFindings(host, draft.pullRequestKey, resolved, iterations, [view]))[0]
}

export function deleteAzureDevOpsReviewDraft(id: string): { deleted: boolean } {
  return { deleted: deleteStoredAzureDevOpsReviewDraft(id) }
}

const publishingPullRequests = new Set<string>()

export async function publishAzureDevOpsReviewDrafts(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string,
  draftIds: readonly string[],
  vote?: AzureDevOpsReviewCastableVote
): Promise<AzureDevOpsReviewPublishResult> {
  // Why: two publish clicks (desktop + phone) must not post the same comment twice.
  if (publishingPullRequests.has(pullRequestKey)) {
    throw new Error('Drafts for this pull request are already being published.')
  }
  publishingPullRequests.add(pullRequestKey)
  try {
    const resolved = await resolveAzureDevOpsReviewPullRequest(host, pullRequestKey)
    // Why first: a vote this pull request cannot take stops the publish before a comment leaves.
    const voter = vote ? await resolveAzureDevOpsReviewVoter(resolved) : null
    const iterations = await loadAzureDevOpsReviewIterations(resolved.target)
    const latest = latestAzureDevOpsReviewIteration(iterations)
    const needsChanges = draftIds.some((id) => {
      const kind = getStoredAzureDevOpsReviewDraft(id)?.kind
      return kind === 'inline' || kind === 'file'
    })
    const needsThreads = draftIds.some(
      (id) => getStoredAzureDevOpsReviewDraft(id)?.kind === 'reply'
    )
    const [changes, threads] = await Promise.all([
      needsChanges && latest
        ? listAzureDevOpsReviewIterationChanges(resolved.target, latest.id).then((raw) =>
            raw.map(mapAzureDevOpsReviewChange)
          )
        : Promise.resolve([]),
      needsThreads
        ? listAzureDevOpsReviewThreads(resolved.target).then((raw) =>
            raw.map(mapAzureDevOpsReviewThread)
          )
        : Promise.resolve([])
    ])

    const results: AzureDevOpsReviewPublishResult['results'] = []
    for (const draftId of draftIds) {
      const draft = getStoredAzureDevOpsReviewDraft(draftId)
      if (!draft || draft.pullRequestKey !== pullRequestKey) {
        results.push({ draftId, ok: false, error: 'Draft not found for this pull request.' })
        continue
      }
      if (draft.state === 'published') {
        results.push({ draftId, ok: true, error: null })
        continue
      }
      if (isAzureDevOpsReviewDraftOutdated(draft, latest)) {
        results.push({
          draftId,
          ok: false,
          error: 'The draft targets an older iteration. Update or re-anchor it first.'
        })
        continue
      }
      try {
        let publishedThreadId: number | null = null
        if (draft.kind === 'reply' && draft.threadId !== null) {
          const thread = threads.find((candidate) => candidate?.id === draft.threadId)
          const parentCommentId = thread?.comments[0]?.id ?? 1
          await createAzureDevOpsReviewReply(
            resolved.target,
            draft.threadId,
            draft.body,
            parentCommentId
          )
          const wireStatus = draft.threadStatus
            ? azureDevOpsThreadStatusToWire(draft.threadStatus)
            : null
          if (wireStatus !== null) {
            await updateAzureDevOpsReviewThreadStatus(resolved.target, draft.threadId, wireStatus)
          }
          publishedThreadId = draft.threadId
        } else {
          const change = changes.find((candidate) => candidate?.path === draft.filePath)
          const created = await createAzureDevOpsReviewThread(
            resolved.target,
            buildAzureDevOpsThreadPayload(draft, {
              iterationId: draft.iterationId ?? latest?.id ?? null,
              changeTrackingId: change?.changeTrackingId ?? null
            })
          )
          publishedThreadId = created.id
        }
        putStoredAzureDevOpsReviewDraft({
          ...draft,
          state: 'published',
          publishError: null,
          publishedThreadId,
          updatedAt: Date.now()
        })
        results.push({ draftId, ok: true, error: null })
      } catch (error) {
        putStoredAzureDevOpsReviewDraft({
          ...draft,
          state: 'failed',
          publishError: describeAzureDevOpsReviewError(error),
          updatedAt: Date.now()
        })
        results.push({ draftId, ok: false, error: describeAzureDevOpsReviewError(error) })
      }
    }
    if (!vote || !voter) {
      return { results }
    }
    return {
      results,
      vote: await castAzureDevOpsReviewVoteAfterDrafts(resolved.target, voter, vote, results)
    }
  } finally {
    publishingPullRequests.delete(pullRequestKey)
  }
}
