import { createHash, randomUUID } from 'node:crypto'
import type {
  ConversationContinuationCandidate,
  ConversationContinuationInspection,
  ConversationContinuationPrepareInput,
  ConversationContinuationReference,
  ConversationContinuationSource
} from '../../shared/conversation-continuation'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type {
  openCodexAppServerConnection,
  CodexAppServerLaunch
} from './codex-app-server-connection'
import {
  inspectCodexContinuationSource,
  writeCodexContinuationReference,
  type InspectedCodexContinuationSource,
  type ResolvedCodexContinuationSource
} from './codex-continuation-source'
import { CodexContinuationStore } from './codex-continuation-store'
import { prepareCodexContinuationCandidate } from './codex-continuation-preparation'

export type CodexContinuationResolvedSource = ResolvedCodexContinuationSource & {
  launch: CodexAppServerLaunch
}

export type CodexContinuationServiceDeps = {
  userDataPath: string
  resolveSource: (
    source: ConversationContinuationSource
  ) => Promise<CodexContinuationResolvedSource>
  openConnection?: typeof openCodexAppServerConnection
  resolveCandidateTranscript?: (codexHome: string, threadId: string) => Promise<string | null>
  mintCandidateId?: () => string
  now?: () => number
  requestTimeoutMs?: number
  compactionTimeoutMs?: number
}

function sourceMatches(
  expected: ConversationContinuationSource,
  actual: CodexContinuationResolvedSource
): boolean {
  return (
    expected.providerSessionId === actual.providerSessionId &&
    expected.workspaceId === actual.workspaceId
  )
}

function assertResolvedLaunch(
  requested: ConversationContinuationSource,
  resolved: CodexContinuationResolvedSource
): void {
  if (!sourceMatches(requested, resolved)) {
    throw new Error('conversation_continuation_resolver_identity_mismatch')
  }
  if (
    !resolved.launch.cwd ||
    normalizeRuntimePathForComparison(resolved.launch.cwd) !==
      normalizeRuntimePathForComparison(resolved.cwd)
  ) {
    throw new Error('conversation_continuation_launch_cwd_mismatch')
  }
  const launchHome = resolved.launch.env?.CODEX_HOME
  if (
    !launchHome ||
    normalizeRuntimePathForComparison(launchHome) !==
      normalizeRuntimePathForComparison(resolved.codexHome) ||
    resolved.launch.envToDelete?.includes('CODEX_HOME')
  ) {
    throw new Error('conversation_continuation_launch_home_mismatch')
  }
  if (resolved.launch.args.at(-1) !== 'app-server') {
    throw new Error('conversation_continuation_launch_not_app_server')
  }
}

export class CodexContinuationService {
  private readonly store: CodexContinuationStore
  private preparationQueue = Promise.resolve()

  constructor(private readonly deps: CodexContinuationServiceDeps) {
    this.store = new CodexContinuationStore(deps.userDataPath, deps.now)
  }

  async inspect(
    source: ConversationContinuationSource
  ): Promise<ConversationContinuationInspection> {
    const { inspected } = await this.resolveAndInspect(source)
    if (inspected.checkpoint) {
      await this.store.pruneOtherRevisions(
        source.providerSessionId,
        source.workspaceId,
        inspected.checkpoint.revision
      )
    }
    return { source: { ...source }, checkpoint: inspected.checkpoint }
  }

  async prepareInBackground(
    input: ConversationContinuationPrepareInput,
    handoff?: string
  ): Promise<ConversationContinuationCandidate> {
    const { inspected } = await this.resolveAndInspect(input.source)
    const checkpoint = inspected.checkpoint
    if (!checkpoint) {
      throw new Error('conversation_continuation_no_completed_turn')
    }
    if (checkpoint.revision !== input.expectedRevision) {
      throw new Error('conversation_continuation_checkpoint_changed')
    }
    await this.store.pruneOtherRevisions(
      input.source.providerSessionId,
      input.source.workspaceId,
      checkpoint.revision
    )
    const existing = this.store.findCheckpoint(
      input.source.providerSessionId,
      input.source.workspaceId,
      checkpoint.revision,
      handoff ? createHash('sha256').update(handoff).digest('hex') : undefined
    )
    if (existing) {
      return existing
    }
    const now = this.nowIso()
    const candidate: ConversationContinuationCandidate = {
      candidateId: this.deps.mintCandidateId?.() ?? randomUUID(),
      source: { ...input.source },
      checkpoint,
      status: 'preparing',
      createdAt: now,
      updatedAt: now,
      ...(handoff
        ? {
            mode: 'fresh' as const,
            handoffDigest: createHash('sha256').update(handoff).digest('hex')
          }
        : {})
    }
    await this.store.put(candidate)
    this.preparationQueue = this.preparationQueue
      .then(() =>
        prepareCodexContinuationCandidate({
          candidateId: candidate.candidateId,
          store: this.store,
          deps: this.deps,
          resolveAndInspect: (source) => this.resolveAndInspect(source),
          nowIso: () => this.nowIso(),
          handoff
        })
      )
      .catch((error) => console.error('Codex continuation preparation failed', error))
    return candidate
  }

  status(candidateId: string): ConversationContinuationCandidate | null {
    return this.store.get(candidateId)
  }

  async prepareReference(
    input: ConversationContinuationPrepareInput
  ): Promise<ConversationContinuationReference> {
    const { resolved, inspected } = await this.resolveAndInspect(input.source)
    const checkpoint = inspected.checkpoint
    if (
      !checkpoint ||
      inspected.checkpointByteOffset === null ||
      checkpoint.revision !== input.expectedRevision
    ) {
      throw new Error(
        checkpoint
          ? 'conversation_continuation_checkpoint_changed'
          : 'conversation_continuation_no_completed_turn'
      )
    }
    return writeCodexContinuationReference({
      userDataPath: this.deps.userDataPath,
      source: input.source,
      resolved,
      checkpoint,
      checkpointByteOffset: inspected.checkpointByteOffset
    })
  }

  async markUsed(candidateId: string): Promise<ConversationContinuationCandidate> {
    const candidate = this.store.get(candidateId)
    if (!candidate) {
      throw new Error('conversation_continuation_candidate_not_found')
    }
    if (candidate.status === 'used') {
      return candidate
    }
    if (candidate.status !== 'ready') {
      throw new Error('conversation_continuation_candidate_not_ready')
    }
    const latest = await this.resolveAndInspect(candidate.source)
    if (latest.inspected.checkpoint?.revision !== candidate.checkpoint.revision) {
      await this.updateStatus(candidateId, 'stale')
      throw new Error('conversation_continuation_checkpoint_changed')
    }
    const updated = await this.store.update(candidateId, (current) => ({
      ...current,
      status: 'used',
      updatedAt: this.nowIso()
    }))
    if (!updated) {
      throw new Error('conversation_continuation_candidate_not_found')
    }
    return updated
  }

  /** Claims a prepared provider session exactly once before any resume attempt. */
  async claim(candidateId: string): Promise<ConversationContinuationCandidate> {
    const candidate = this.store.get(candidateId)
    if (!candidate) {
      throw new Error('conversation_continuation_candidate_not_found')
    }
    if (candidate.status !== 'ready') {
      throw new Error('conversation_continuation_candidate_not_ready')
    }
    const latest = await this.resolveAndInspect(candidate.source)
    if (latest.inspected.checkpoint?.revision !== candidate.checkpoint.revision) {
      await this.updateStatus(candidateId, 'stale')
      throw new Error('conversation_continuation_checkpoint_changed')
    }
    const claimed = await this.store.update(candidateId, (current) => {
      if (current.status !== 'ready') {
        throw new Error('conversation_continuation_candidate_already_claimed')
      }
      return { ...current, status: 'used', updatedAt: this.nowIso() }
    })
    if (!claimed) {
      throw new Error('conversation_continuation_candidate_not_found')
    }
    return claimed
  }

  /** Test and shutdown seam: waits for queued preparation and durable state writes. */
  async settled(): Promise<void> {
    await this.preparationQueue
    await this.store.settled()
  }

  private async resolveAndInspect(source: ConversationContinuationSource): Promise<{
    resolved: CodexContinuationResolvedSource
    inspected: InspectedCodexContinuationSource
  }> {
    const resolved = await this.deps.resolveSource(source)
    assertResolvedLaunch(source, resolved)
    return { resolved, inspected: await inspectCodexContinuationSource(resolved) }
  }

  private async updateStatus(
    candidateId: string,
    status: ConversationContinuationCandidate['status'],
    error?: string
  ): Promise<void> {
    await this.store.update(candidateId, (candidate) => ({
      ...candidate,
      status,
      ...(error ? { error } : {}),
      updatedAt: this.nowIso()
    }))
  }

  private nowIso(): string {
    return new Date(this.deps.now?.() ?? Date.now()).toISOString()
  }
}
