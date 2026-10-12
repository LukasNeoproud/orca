import {
  AZURE_DEVOPS_REVIEW_THREAD_STATUSES,
  type AzureDevOpsLineAnchor,
  type AzureDevOpsReviewDraft,
  type AzureDevOpsReviewDraftAuthor,
  type AzureDevOpsReviewDraftCreateInput,
  type AzureDevOpsReviewDraftKind,
  type AzureDevOpsReviewDraftPatch,
  type AzureDevOpsReviewDraftView,
  type AzureDevOpsReviewIteration,
  type AzureDevOpsThreadStatus
} from '../../../shared/azure-devops-review-types'

const MAX_BODY_LENGTH = 64_000
const DRAFT_KINDS: readonly AzureDevOpsReviewDraftKind[] = ['inline', 'file', 'general', 'reply']

export class AzureDevOpsReviewDraftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AzureDevOpsReviewDraftError'
  }
}

function normalizeAnchor(input: unknown): AzureDevOpsLineAnchor | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  const startLine = Number(record.startLine)
  const endLine = Number(record.endLine ?? record.startLine)
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1) {
    return null
  }
  return {
    side: record.side === 'left' ? 'left' : 'right',
    startLine,
    endLine: Math.max(startLine, endLine)
  }
}

function normalizeThreadStatus(input: unknown): AzureDevOpsThreadStatus | null {
  return typeof input === 'string' &&
    (AZURE_DEVOPS_REVIEW_THREAD_STATUSES as readonly string[]).includes(input)
    ? (input as AzureDevOpsThreadStatus)
    : null
}

function normalizeAuthor(input: unknown): AzureDevOpsReviewDraftAuthor {
  if (input && typeof input === 'object' && (input as { kind?: unknown }).kind === 'agent') {
    const label = (input as { label?: unknown }).label
    return { kind: 'agent', label: typeof label === 'string' && label.trim() ? label.trim() : null }
  }
  return { kind: 'user' }
}

function normalizePath(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim().replace(/^\/+/, '') : null
}

function finiteOrNull(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null
}

export function normalizeAzureDevOpsReviewDraft(input: unknown): AzureDevOpsReviewDraft | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.pullRequestKey !== 'string' ||
    typeof record.body !== 'string' ||
    !DRAFT_KINDS.includes(record.kind as AzureDevOpsReviewDraftKind)
  ) {
    return null
  }
  const state = record.state === 'published' || record.state === 'failed' ? record.state : 'draft'
  return {
    id: record.id,
    pullRequestKey: record.pullRequestKey,
    kind: record.kind as AzureDevOpsReviewDraftKind,
    filePath: normalizePath(record.filePath),
    anchor: normalizeAnchor(record.anchor),
    threadId: finiteOrNull(record.threadId),
    threadStatus: normalizeThreadStatus(record.threadStatus),
    body: record.body,
    author: normalizeAuthor(record.author),
    iterationId: finiteOrNull(record.iterationId),
    commit: typeof record.commit === 'string' ? record.commit : null,
    state,
    publishError: typeof record.publishError === 'string' ? record.publishError : null,
    publishedThreadId: finiteOrNull(record.publishedThreadId),
    createdAt: finiteOrNull(record.createdAt) ?? 0,
    updatedAt: finiteOrNull(record.updatedAt) ?? 0
  }
}

function requireBody(body: string | undefined): string {
  const trimmed = body?.trim() ?? ''
  if (!trimmed) {
    throw new AzureDevOpsReviewDraftError('A draft comment needs a body.')
  }
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new AzureDevOpsReviewDraftError('The draft comment is too long.')
  }
  return trimmed
}

function assertDraftAnchorFields(
  draft: Pick<AzureDevOpsReviewDraft, 'kind' | 'filePath' | 'anchor' | 'threadId'>
): void {
  if ((draft.kind === 'inline' || draft.kind === 'file') && !draft.filePath) {
    throw new AzureDevOpsReviewDraftError(`A ${draft.kind} draft needs a file path.`)
  }
  if (draft.kind === 'inline' && !draft.anchor) {
    throw new AzureDevOpsReviewDraftError('An inline draft needs a line range.')
  }
  if (draft.kind === 'reply' && draft.threadId === null) {
    throw new AzureDevOpsReviewDraftError('A reply draft needs a thread id.')
  }
}

function latestOf(
  iterations: readonly AzureDevOpsReviewIteration[]
): AzureDevOpsReviewIteration | null {
  return iterations.reduce<AzureDevOpsReviewIteration | null>(
    (latest, iteration) => (!latest || iteration.id > latest.id ? iteration : latest),
    null
  )
}

export function buildAzureDevOpsReviewDraft(
  input: AzureDevOpsReviewDraftCreateInput,
  context: { id: string; now: number; iterations: readonly AzureDevOpsReviewIteration[] }
): AzureDevOpsReviewDraft {
  if (!DRAFT_KINDS.includes(input.kind)) {
    throw new AzureDevOpsReviewDraftError(`Unknown draft kind: ${String(input.kind)}`)
  }
  const anchored = input.kind === 'inline' || input.kind === 'file'
  // Why: a draft written against an older checkout keeps that iteration so it shows as outdated.
  const requestedCommit = input.commit?.trim().toLowerCase() || null
  const matched = requestedCommit
    ? context.iterations.find(
        (iteration) => iteration.sourceCommit?.toLowerCase() === requestedCommit
      )
    : null
  const iteration = matched ?? latestOf(context.iterations)
  const draft: AzureDevOpsReviewDraft = {
    id: context.id,
    pullRequestKey: input.pullRequestKey,
    kind: input.kind,
    filePath: anchored ? normalizePath(input.filePath) : null,
    anchor: input.kind === 'inline' ? normalizeAnchor(input.anchor) : null,
    threadId: input.kind === 'reply' ? finiteOrNull(input.threadId) : null,
    threadStatus: input.kind === 'reply' ? normalizeThreadStatus(input.threadStatus) : null,
    body: requireBody(input.body),
    author: normalizeAuthor(input.author),
    iterationId: iteration?.id ?? null,
    commit: requestedCommit ?? iteration?.sourceCommit ?? null,
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: context.now,
    updatedAt: context.now
  }
  assertDraftAnchorFields(draft)
  return draft
}

export function applyAzureDevOpsReviewDraftPatch(
  draft: AzureDevOpsReviewDraft,
  patch: AzureDevOpsReviewDraftPatch,
  context: { now: number; latestIteration: AzureDevOpsReviewIteration | null }
): AzureDevOpsReviewDraft {
  if (draft.state === 'published') {
    throw new AzureDevOpsReviewDraftError('A published draft can no longer be edited.')
  }
  const anchored = draft.kind === 'inline' || draft.kind === 'file'
  const moved =
    anchored && (patch.anchor !== undefined || patch.filePath !== undefined || patch.rebaseToLatest)
  const next: AzureDevOpsReviewDraft = {
    ...draft,
    body: patch.body !== undefined ? requireBody(patch.body) : draft.body,
    filePath:
      anchored && patch.filePath !== undefined ? normalizePath(patch.filePath) : draft.filePath,
    anchor:
      draft.kind === 'inline' && patch.anchor !== undefined
        ? normalizeAnchor(patch.anchor)
        : draft.anchor,
    threadStatus:
      draft.kind === 'reply' && patch.threadStatus !== undefined
        ? normalizeThreadStatus(patch.threadStatus)
        : draft.threadStatus,
    // Why: moving an anchored draft means it now targets the latest iteration.
    iterationId: moved && context.latestIteration ? context.latestIteration.id : draft.iterationId,
    commit: moved && context.latestIteration ? context.latestIteration.sourceCommit : draft.commit,
    state: 'draft',
    publishError: null,
    updatedAt: context.now
  }
  assertDraftAnchorFields(next)
  return next
}

export function isAzureDevOpsReviewDraftOutdated(
  draft: AzureDevOpsReviewDraft,
  latestIteration: AzureDevOpsReviewIteration | null
): boolean {
  if (draft.state === 'published' || (draft.kind !== 'inline' && draft.kind !== 'file')) {
    return false
  }
  return (
    latestIteration !== null && draft.iterationId !== null && draft.iterationId < latestIteration.id
  )
}

export function toAzureDevOpsReviewDraftView(
  draft: AzureDevOpsReviewDraft,
  latestIteration: AzureDevOpsReviewIteration | null
): AzureDevOpsReviewDraftView {
  return { ...draft, outdated: isAzureDevOpsReviewDraftOutdated(draft, latestIteration) }
}

export function sortAzureDevOpsReviewDrafts<T extends AzureDevOpsReviewDraft>(drafts: T[]): T[] {
  return [...drafts].sort((a, b) => a.createdAt - b.createdAt)
}
