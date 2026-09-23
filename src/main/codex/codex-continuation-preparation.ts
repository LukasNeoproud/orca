import type { ConversationContinuationSource } from '../../shared/conversation-continuation'
import {
  isCodexAppServerRequestError,
  openCodexAppServerConnection,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import { isCodexAppServerUnsupportedError } from './codex-app-server-session'
import { readCodexThreadId, readCodexThreadPath } from './codex-structured-thread-facts'
import { StructuredSessionCompaction } from '../native-chat/agent-session-wire/structured-session-compaction'
import { resolvePinnedCodexRolloutProof } from './codex-tui-rollout-proof'
import {
  inspectCodexContinuationSource,
  inspectCodexContextSource
} from './codex-continuation-source'
import { createCodexFreshContext } from './codex-fresh-context'
import type { CodexContinuationStore } from './codex-continuation-store'
import type {
  CodexContinuationResolvedSource,
  CodexContinuationServiceDeps
} from './codex-continuation-service'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_COMPACTION_TIMEOUT_MS = 180_000

type ResolveAndInspect = (source: ConversationContinuationSource) => Promise<{
  resolved: CodexContinuationResolvedSource
  inspected: Awaited<ReturnType<typeof inspectCodexContinuationSource>>
}>

function definiteRequestRefusal(error: unknown): boolean {
  return isCodexAppServerRequestError(error) || isCodexAppServerUnsupportedError(error)
}

function errorMessage(error: unknown): string {
  if (
    isCodexAppServerUnsupportedError(error) ||
    (isCodexAppServerRequestError(error) && error.code === -32601)
  ) {
    return 'agent_context_provider_unsupported'
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000)
}

export async function prepareCodexContinuationCandidate(input: {
  candidateId: string
  store: CodexContinuationStore
  deps: CodexContinuationServiceDeps
  resolveAndInspect: ResolveAndInspect
  nowIso: () => string
  handoff?: string
}): Promise<void> {
  const candidate = input.store.get(input.candidateId)
  if (!candidate || candidate.status !== 'preparing') {
    return
  }
  let operation: 'opening' | 'fork-requested' | 'compact-requested' | 'settling' = 'opening'
  let connection: CodexAppServerConnection | null = null
  let candidateThreadId: string | null = null
  let candidateTranscriptPath: string | null = null
  let ambiguousOutcome = false
  const compactions = new StructuredSessionCompaction(
    input.deps.compactionTimeoutMs ?? DEFAULT_COMPACTION_TIMEOUT_MS
  )
  const updateStatus = async (
    status: 'failed' | 'stale' | 'unconfirmed',
    error?: string
  ): Promise<void> => {
    await input.store.update(input.candidateId, (current) => ({
      ...current,
      status,
      ...(error ? { error } : {}),
      updatedAt: input.nowIso()
    }))
  }
  try {
    const { resolved, inspected } = await input.resolveAndInspect(candidate.source)
    if (inspected.checkpoint?.revision !== candidate.checkpoint.revision) {
      await updateStatus('stale')
      return
    }
    const open = input.deps.openConnection ?? openCodexAppServerConnection
    connection = await open(resolved.launch, {
      onNotification: (method, params) => compactions.codex(input.candidateId, method, params),
      onServerRequest: (request) =>
        connection?.respondWithError(
          request.id,
          -32001,
          'Background continuation preparation cannot answer provider prompts.'
        ),
      onExit: () => compactions.ended(input.candidateId)
    })
    operation = 'fork-requested'
    if (candidate.mode === 'fresh') {
      if (!input.handoff) {
        throw new Error('agent_context_handoff_missing')
      }
      const activity = await inspectCodexContextSource(resolved)
      const base = activity.sessionMeta?.base_instructions
      const baseInstructions =
        base && typeof base === 'object' && 'text' in base && typeof base.text === 'string'
          ? base.text
          : undefined
      const fresh = await createCodexFreshContext({
        connection,
        sourceThreadId: candidate.source.providerSessionId,
        lastTurnId: candidate.checkpoint.lastTurnId,
        cwd: resolved.cwd,
        handoff: input.handoff,
        baseInstructions,
        timeoutMs: input.deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        onCreated: async (threadId, transcriptPath) => {
          candidateThreadId = threadId
          candidateTranscriptPath = transcriptPath
          await input.store.update(input.candidateId, (current) => ({
            ...current,
            providerSessionId: threadId,
            ...(transcriptPath ? { transcriptPath } : {}),
            updatedAt: input.nowIso()
          }))
        }
      })
      candidateThreadId = fresh.threadId
      candidateTranscriptPath = fresh.transcriptPath
    } else {
      const forked = await connection.request(
        'thread/fork',
        {
          threadId: candidate.source.providerSessionId,
          lastTurnId: candidate.checkpoint.lastTurnId,
          cwd: resolved.cwd,
          excludeTurns: true,
          deferGoalContinuation: true
        },
        { timeoutMs: input.deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS }
      )
      candidateThreadId = readCodexThreadId(forked)
      if (!candidateThreadId || candidateThreadId === candidate.source.providerSessionId) {
        throw new Error('conversation_continuation_fork_identity_missing')
      }
      candidateTranscriptPath = readCodexThreadPath(forked)
      await input.store.update(input.candidateId, (current) => ({
        ...current,
        providerSessionId: candidateThreadId!,
        ...(candidateTranscriptPath ? { transcriptPath: candidateTranscriptPath } : {}),
        updatedAt: input.nowIso()
      }))
      operation = 'compact-requested'
      let compacted: { error?: string }
      try {
        compacted = await compactions.run(input.candidateId, candidateThreadId, () =>
          connection!.request(
            'thread/compact/start',
            { threadId: candidateThreadId! },
            { timeoutMs: input.deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS }
          )
        )
      } catch (error) {
        ambiguousOutcome = !definiteRequestRefusal(error)
        throw error
      }
      if (compacted.error) {
        throw new Error(compacted.error)
      }
    }
    operation = 'settling'
    candidateTranscriptPath ??= await (
      input.deps.resolveCandidateTranscript ?? resolvePinnedCodexRolloutProof
    )(resolved.codexHome, candidateThreadId)
    if (!candidateTranscriptPath) {
      throw new Error('conversation_continuation_transcript_missing')
    }
    await inspectCodexContinuationSource({
      providerSessionId: candidateThreadId,
      workspaceId: candidate.source.workspaceId,
      cwd: resolved.cwd,
      transcriptPath: candidateTranscriptPath,
      codexHome: resolved.codexHome
    })
    const stopped = await connection.close()
    connection = null
    if (!stopped) {
      ambiguousOutcome = true
      throw new Error('conversation_continuation_app_server_exit_unconfirmed')
    }
    const latest = await input.resolveAndInspect(candidate.source)
    await input.store.update(input.candidateId, (current) => ({
      ...current,
      providerSessionId: candidateThreadId!,
      transcriptPath: candidateTranscriptPath!,
      status:
        latest.inspected.checkpoint?.revision === candidate.checkpoint.revision ? 'ready' : 'stale',
      error: undefined,
      updatedAt: input.nowIso()
    }))
  } catch (error) {
    if (operation === 'fork-requested' && !definiteRequestRefusal(error)) {
      ambiguousOutcome = true
    }
    await input.store.update(input.candidateId, (current) => ({
      ...current,
      ...(candidateThreadId ? { providerSessionId: candidateThreadId } : {}),
      ...(candidateTranscriptPath ? { transcriptPath: candidateTranscriptPath } : {}),
      status: ambiguousOutcome ? 'unconfirmed' : 'failed',
      error: errorMessage(error),
      updatedAt: input.nowIso()
    }))
  } finally {
    if (connection) {
      compactions.ended(input.candidateId)
      const stopped = await connection.close().catch(() => false)
      if (!stopped && operation !== 'opening') {
        await updateStatus('unconfirmed', 'Codex continuation process exit could not be confirmed.')
      }
    }
  }
}
