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
  type AzureDevOpsReviewHost
} from './azure-devops-review-service'
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
import {
  deleteStoredAzureDevOpsReviewDraft,
  getStoredAzureDevOpsReviewDraft,
  putStoredAzureDevOpsReviewDraft
} from './azure-devops-review-draft-store'

export async function listAzureDevOpsReviewDrafts(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string
): Promise<{
  drafts: AzureDevOpsReviewDraftView[]
  latestIteration: AzureDevOpsReviewIteration | null
}> {
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, pullRequestKey)
  const latest = latestAzureDevOpsReviewIteration(
    await loadAzureDevOpsReviewIterations(resolved.target)
  )
  return { drafts: azureDevOpsReviewDraftViews(pullRequestKey, latest), latestIteration: latest }
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
  return toAzureDevOpsReviewDraftView(draft, latestAzureDevOpsReviewIteration(iterations))
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
  const latest = latestAzureDevOpsReviewIteration(
    await loadAzureDevOpsReviewIterations(resolved.target)
  )
  const next = applyAzureDevOpsReviewDraftPatch(draft, patch, {
    now: Date.now(),
    latestIteration: latest
  })
  putStoredAzureDevOpsReviewDraft(next)
  return toAzureDevOpsReviewDraftView(next, latest)
}

export function deleteAzureDevOpsReviewDraft(id: string): { deleted: boolean } {
  return { deleted: deleteStoredAzureDevOpsReviewDraft(id) }
}

const publishingPullRequests = new Set<string>()

export async function publishAzureDevOpsReviewDrafts(
  host: AzureDevOpsReviewHost,
  pullRequestKey: string,
  draftIds: readonly string[]
): Promise<AzureDevOpsReviewPublishResult> {
  // Why: two publish clicks (desktop + phone) must not post the same comment twice.
  if (publishingPullRequests.has(pullRequestKey)) {
    throw new Error('Drafts for this pull request are already being published.')
  }
  publishingPullRequests.add(pullRequestKey)
  try {
    const resolved = await resolveAzureDevOpsReviewPullRequest(host, pullRequestKey)
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
    return { results }
  } finally {
    publishingPullRequests.delete(pullRequestKey)
  }
}
