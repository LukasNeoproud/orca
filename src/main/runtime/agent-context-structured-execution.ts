import { createHash } from 'node:crypto'
import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
import { computeAgentSessionPayloadFingerprint } from '../../shared/agent-session-mutation-envelope'
import type {
  AgentContextTransitionRequest,
  AgentContextTransitionResult
} from '../../shared/agent-context-transition'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { ConversationReplacement } from '../native-chat/agent-session-wire/structured-conversation-command'

type StructuredExecutionRuntime = {
  replaceStructuredAgentSessionTab(replacement: ConversationReplacement): Promise<void>
}

export type AgentContextStructuredCandidate = {
  providerSessionId: string
  transcriptPath: string
}

export type AgentContextStructuredExecutionEffects = {
  guard: () => boolean | Promise<boolean>
  markEffectPossible: () => void | boolean | Promise<void | boolean>
  claimCandidate?: () => void | Promise<void>
  recordResult?: (result: AgentContextTransitionResult) => Promise<void>
}

function operationId(request: AgentContextTransitionRequest, purpose: string): string {
  const timestamp = Date.parse(request.createdAt)
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error('agent_context_transition_timestamp_invalid')
  }
  return `${timestamp.toString().padStart(13, '0')}-${createHash('sha256')
    .update(JSON.stringify([request.requestId, request.target.sessionId ?? null, purpose]))
    .digest('hex')
    .slice(0, 32)}`
}

function callerKey(request: AgentContextTransitionRequest): string {
  return `agent-context:${request.requestId}`
}

function sourceRecord(
  request: AgentContextTransitionRequest,
  host: NonNullable<ReturnType<typeof getStructuredAgentSessionHost>>
) {
  const sessionId = request.target.sessionId
  if (!sessionId) {
    throw new Error('agent_context_transition_structured_session_missing')
  }
  const record = host.deps.store.getRecord(sessionId)
  if (
    !record ||
    record.provider !== 'codex' ||
    record.location.workspaceId !== request.target.workspaceId ||
    !record.providerHandleChain.some(
      (link) =>
        link.handle.provider === 'codex' &&
        link.handle.threadId === request.target.providerSessionId
    )
  ) {
    throw new Error('agent_context_transition_source_stale')
  }
  return { sessionId, record }
}

/**
 * Replaces a native structured Codex session with a pre-prepared provider thread.
 * The provider preparation belongs to the request coordinator; this only performs
 * the durable native-session transition and optional exactly-once continuation.
 */
export async function executeAgentContextStructured(
  runtime: StructuredExecutionRuntime,
  request: AgentContextTransitionRequest,
  candidate: AgentContextStructuredCandidate,
  effects: AgentContextStructuredExecutionEffects
): Promise<AgentContextTransitionResult> {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    throw new Error('agent_context_transition_structured_host_unavailable')
  }
  const source = sourceRecord(request, host)
  const caller = { callerKey: callerKey(request) }
  const replacement = {
    providerSessionId: candidate.providerSessionId,
    transcriptPath: candidate.transcriptPath,
    mode: request.input.mode
  }
  const clearOperationId = operationId(request, 'clear')
  const clearEnvelope = {
    sessionId: source.sessionId,
    clientOperationId: clearOperationId,
    expectedRuntimeFence: source.record.lease.runtimeFence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method: 'agentSession.conversationCommand',
      sessionId: source.sessionId,
      fields: { command: 'clear', replacement }
    })
  }
  const cleared = await host.conversationCommand(caller, {
    envelope: clearEnvelope,
    command: 'clear',
    replacement,
    beforeRun: async () => {
      if (!(await effects.guard())) {
        throw new Error('agent_context_transition_source_stale')
      }
      if ((await effects.markEffectPossible()) === false) {
        throw new Error('agent_context_transition_effect_refused')
      }
      await effects.claimCandidate?.()
    }
  })
  if (!cleared.ok) {
    throw new Error(cleared.refusal.code)
  }
  const replacementSessionId = cleared.value.replacementSessionId
  if (!replacementSessionId) {
    throw new Error(cleared.value.error ?? 'agent_context_transition_replacement_unavailable')
  }
  const surfaceReplacement = host
    .conversationReplacements()
    .find(
      (entry) =>
        entry.sourceSessionId === source.sessionId && entry.sessionId === replacementSessionId
    )
  if (!surfaceReplacement) {
    throw new Error('agent_context_transition_replacement_unavailable')
  }
  await runtime.replaceStructuredAgentSessionTab(surfaceReplacement)
  await effects.recordResult?.({
    newProviderSessionId: candidate.providerSessionId,
    newSessionId: replacementSessionId
  })
  await host.close(source.sessionId)

  if (request.input.continuation === 'continue') {
    const nextStep = request.input.checkpoint.nextStep
    if (!nextStep) {
      throw new Error('agent_context_transition_next_step_missing')
    }
    const destination = host.deps.store.getRecord(replacementSessionId)
    if (!destination) {
      throw new Error('agent_context_transition_replacement_unavailable')
    }
    const body: AgentJournalMessageItem = {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: nextStep }]
    }
    const sendOperationId = operationId(request, 'continue')
    const submitted = await host.send(caller, {
      envelope: {
        sessionId: replacementSessionId,
        clientOperationId: sendOperationId,
        expectedRuntimeFence: destination.lease.runtimeFence,
        payloadFingerprint: computeAgentSessionPayloadFingerprint({
          method: 'agentSession.send',
          sessionId: replacementSessionId,
          fields: { body }
        })
      },
      body,
      beforeDispatch: () =>
        host
          .journalSnapshot(replacementSessionId)
          .submissions.some((submission) => submission.clientMessageId !== sendOperationId)
          ? {
              code: 'agent_session_operation_invalid',
              message: 'The replacement conversation received another message before continuation.'
            }
          : null
    })
    if (!submitted.ok) {
      throw new Error(submitted.refusal.code)
    }
    if (submitted.value.submission.dispatchState !== 'accepted') {
      throw new Error('agent_context_transition_continuation_unconfirmed')
    }
  }

  return {
    newProviderSessionId: candidate.providerSessionId,
    newSessionId: replacementSessionId
  }
}
