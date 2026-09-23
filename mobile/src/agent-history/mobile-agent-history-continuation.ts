import type {
  ConversationContinuationCandidate,
  ConversationContinuationReference,
  ConversationContinuationSource
} from '../../../src/shared/conversation-continuation'
import {
  CONVERSATION_CONTINUATION_CAPABILITY,
  type ConversationContinuationView
} from '../../../src/shared/conversation-continuation-view'
import { LOCAL_EXECUTION_HOST_ID } from '../../../src/shared/execution-host'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { resolveMobileAiVaultResumePlatform } from '../session/ai-vault-resume-launch'
import {
  createMobileStructuredAgentSession,
  createMobileStructuredAgentSessionId,
  type MobileStructuredAgentLaunchResult
} from '../session/mobile-structured-agent-session-launch'
import {
  clearMobileStructuredLaunchDraft,
  stageMobileStructuredLaunchDraft
} from '../session/mobile-structured-launch-drafts'
import type { MobileAiVaultSessionResumeTarget } from './agent-history-resume-target'

const CONTINUATION_RPC_TIMEOUT_MS = 30_000

export class MobileContinuationCancelledError extends Error {
  constructor() {
    super('conversation_continuation_cancelled')
  }
}

export function canOfferMobileAgentHistoryContinuation(
  session: Pick<AiVaultSession, 'agent' | 'executionHostId' | 'structuredSession'>,
  hostCapabilities: readonly string[]
): boolean {
  const capabilities = new Set(hostCapabilities)
  return (
    session.agent === 'codex' &&
    session.executionHostId === LOCAL_EXECUTION_HOST_ID &&
    (!session.structuredSession || session.structuredSession.ownerState === 'live') &&
    capabilities.has(CONVERSATION_CONTINUATION_CAPABILITY) &&
    capabilities.has(STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY) &&
    capabilities.has(STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY) &&
    capabilities.has(STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY)
  )
}

export function mobileContinuationSource(
  session: Pick<AiVaultSession, 'sessionId'>,
  workspaceId: string
): ConversationContinuationSource {
  return { providerSessionId: session.sessionId, workspaceId }
}

export function isSupportedMobileContinuationTarget(
  target: MobileAiVaultSessionResumeTarget,
  hostPlatform: NodeJS.Platform | null
): target is Extract<MobileAiVaultSessionResumeTarget, { status: 'ready' }> {
  if (target.status !== 'ready' || !hostPlatform) {
    return false
  }
  return (
    resolveMobileAiVaultResumePlatform(
      target.targetStatus,
      hostPlatform,
      target.workspacePath,
      target.terminalPlatform
    ) === hostPlatform
  )
}

export async function inspectMobileConversationContinuation(
  client: Pick<RpcClient, 'sendRequest'>,
  source: ConversationContinuationSource
): Promise<ConversationContinuationView> {
  const view = await callContinuation<ConversationContinuationView>(client, 'inspect', { source })
  if (
    view?.source?.providerSessionId !== source.providerSessionId ||
    view.source.workspaceId !== source.workspaceId
  ) {
    throw new Error('The continuation response did not match this conversation.')
  }
  return view
}

export type MobileContinuationLaunchResult =
  | { kind: 'opened'; sessionId: string }
  | { kind: 'preparing'; candidate: ConversationContinuationCandidate }
  | { kind: 'blocked'; message: string }

export async function launchMobileConversationContinuation(args: {
  client: RpcClient
  hostId: string
  worktreeId: string
  source: ConversationContinuationSource
  mode: 'compacted' | 'reference' | 'fresh'
  isCurrent: () => boolean
}): Promise<MobileContinuationLaunchResult> {
  if (args.mode === 'fresh') {
    return createContinuationSession(args)
  }

  const view = await inspectMobileConversationContinuation(args.client, args.source)
  assertCurrent(args.isCurrent)
  const checkpoint = view.checkpoint
  if (!checkpoint) {
    return { kind: 'blocked', message: 'Wait for the current turn to finish.' }
  }

  if (args.mode === 'reference') {
    const prepared = await callContinuation<ConversationContinuationReference>(
      args.client,
      'reference',
      { source: args.source, expectedRevision: checkpoint.revision }
    )
    assertCurrent(args.isCurrent)
    if (typeof prepared.reference !== 'string' || !prepared.reference.trim()) {
      return { kind: 'blocked', message: 'The conversation reference could not be prepared.' }
    }
    return createContinuationSession(args, prepared.reference)
  }

  const candidate =
    view.candidate?.status === 'ready' && view.candidate.checkpoint.revision === checkpoint.revision
      ? view.candidate
      : await callContinuation<ConversationContinuationCandidate>(args.client, 'prepare', {
          source: args.source,
          expectedRevision: checkpoint.revision
        })
  assertCurrent(args.isCurrent)
  if (candidate.status === 'preparing') {
    return { kind: 'preparing', candidate }
  }
  if (candidate.status !== 'ready' || !candidate.providerSessionId || !candidate.transcriptPath) {
    return {
      kind: 'blocked',
      message:
        candidate.error ??
        'Preparation could not be confirmed. The original conversation is available.'
    }
  }

  const claimed = await callContinuation<ConversationContinuationCandidate>(args.client, 'claim', {
    candidateId: candidate.candidateId
  })
  assertCurrent(args.isCurrent)
  if (
    !claimed.providerSessionId ||
    claimed.providerSessionId !== candidate.providerSessionId ||
    claimed.transcriptPath !== candidate.transcriptPath
  ) {
    return {
      kind: 'blocked',
      message: 'The prepared conversation changed. Reopen it from Session History.'
    }
  }
  return createContinuationSession(args, undefined, claimed.providerSessionId)
}

async function createContinuationSession(
  args: Pick<
    Parameters<typeof launchMobileConversationContinuation>[0],
    'client' | 'hostId' | 'worktreeId' | 'isCurrent'
  >,
  draft?: string,
  resumeProviderSessionId?: string
): Promise<MobileContinuationLaunchResult> {
  const sessionId = createMobileStructuredAgentSessionId('codex')
  if (draft?.trim()) {
    stageMobileStructuredLaunchDraft({ hostId: args.hostId, sessionId, text: draft })
  }
  assertCurrent(args.isCurrent)
  const result = await createMobileStructuredAgentSession(args.client, args.worktreeId, 'codex', {
    sessionId,
    ...(resumeProviderSessionId
      ? { resumeFrom: { providerSessionId: resumeProviderSessionId } }
      : {})
  })
  if (result.kind === 'created') {
    return { kind: 'opened', sessionId }
  }
  if (result.kind !== 'unknown' && draft) {
    clearMobileStructuredLaunchDraft(args.hostId, sessionId)
  }
  return { kind: 'blocked', message: structuredLaunchFailureMessage(result) }
}

function structuredLaunchFailureMessage(
  result: Exclude<MobileStructuredAgentLaunchResult, { kind: 'created' }>
): string {
  return result.kind === 'unsupported'
    ? 'Structured continuation is not available for this workspace.'
    : result.message
}

function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) {
    throw new MobileContinuationCancelledError()
  }
}

async function callContinuation<T>(
  client: Pick<RpcClient, 'sendRequest'>,
  action: 'inspect' | 'prepare' | 'reference' | 'claim',
  params: unknown
): Promise<T> {
  const response = await client.sendRequest(`conversationContinuation.${action}`, params, {
    timeoutMs: CONTINUATION_RPC_TIMEOUT_MS,
    budgetSpansConnect: true,
    failWhenDisconnected: true
  })
  if (!response.ok) {
    const message = response.error?.message || 'Conversation continuation failed.'
    throw new Error(
      message === 'conversation_continuation_candidate_already_claimed'
        ? 'This compact copy was already selected. Reopen it from Session History.'
        : message
    )
  }
  return response.result as T
}
