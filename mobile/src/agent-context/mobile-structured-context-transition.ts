import { z } from 'zod'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  AgentContextTransitionStatusSchema,
  type AgentContextTransitionStatus
} from '../../../src/shared/agent-context-transition'
import { AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'

const Id = z.string().trim().min(1).max(512)
const RequestViewSchema = z
  .object({
    requestId: Id,
    status: AgentContextTransitionStatusSchema,
    mode: z.enum(['compact', 'fresh']),
    reason: z.string(),
    continuation: z.enum(['wait-for-user', 'continue']),
    createdAt: z.string(),
    updatedAt: z.string(),
    errorCode: z.string().optional(),
    result: z
      .object({
        newProviderSessionId: Id,
        newSessionId: Id.optional(),
        newTerminalHandle: Id.optional(),
        newPaneKey: Id.optional()
      })
      .optional()
  })
  .strip()

const SnapshotSchema = z
  .object({
    sessionId: Id,
    workspaceId: Id,
    providerSessionId: Id,
    ownerState: z.enum(['live', 'unverifiable', 'exited']),
    requests: z.array(RequestViewSchema)
  })
  .strip()

export type MobileStructuredContextRequest = z.infer<typeof RequestViewSchema>
export type MobileStructuredContextSnapshot = z.infer<typeof SnapshotSchema>

export type MobileStructuredContextSource = {
  sessionId: string
  workspaceId: string
  providerSessionId: string
  ownerState: 'live' | 'unverifiable'
  title: string
}

export function supportsMobileStructuredContextTransitions(
  hostCapabilities: readonly string[]
): boolean {
  return hostCapabilities.includes(AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY)
}

export function mobileStructuredContextSource(
  session: Pick<AiVaultSession, 'agent' | 'sessionId' | 'structuredSession' | 'title'>
): MobileStructuredContextSource | null {
  if (session.agent !== 'codex' || !session.structuredSession) {
    return null
  }
  return {
    sessionId: session.structuredSession.sessionId,
    workspaceId: session.structuredSession.workspaceId,
    providerSessionId: session.sessionId,
    ownerState: session.structuredSession.ownerState ?? 'unverifiable',
    title: session.title
  }
}

export function canCancelMobileStructuredContextRequest(
  status: AgentContextTransitionStatus
): boolean {
  return status === 'queued' || status === 'ready' || status === 'preparing'
}

export function latestMobileStructuredContextRequest(
  requests: readonly MobileStructuredContextRequest[]
): MobileStructuredContextRequest | null {
  return (
    [...requests].sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.requestId.localeCompare(left.requestId)
    )[0] ?? null
  )
}

export function mobileStructuredContextStatusLabel(status: AgentContextTransitionStatus): string {
  switch (status) {
    case 'queued':
      return 'Waiting for this turn to finish'
    case 'ready':
    case 'preparing':
      return 'Preparing the next context'
    case 'executing':
      return 'Switching context'
    case 'completed':
      return 'Context change completed'
    case 'cancelled':
      return 'Context change cancelled'
    case 'stale':
      return 'Conversation changed; request cancelled'
    case 'failed':
      return 'Context change failed'
    case 'unconfirmed':
      return 'Outcome unconfirmed; the request will not repeat automatically'
  }
}

export async function inspectMobileStructuredContextTransition(
  client: Pick<RpcClient, 'sendRequest'>,
  source: MobileStructuredContextSource
): Promise<MobileStructuredContextSnapshot> {
  const response = await client.sendRequest(
    'agentContext.inspectStructured',
    { sessionId: source.sessionId },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  return parseSnapshotResponse(response, source)
}

export async function cancelMobileStructuredContextTransition(
  client: Pick<RpcClient, 'sendRequest'>,
  source: MobileStructuredContextSource,
  request: MobileStructuredContextRequest
): Promise<MobileStructuredContextSnapshot> {
  if (!canCancelMobileStructuredContextRequest(request.status)) {
    throw new Error('This context change can no longer be cancelled.')
  }
  const response = await client.sendRequest(
    'agentContext.cancelStructuredPending',
    { sessionId: source.sessionId, requestId: request.requestId },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  return parseSnapshotResponse(response, source)
}

function parseSnapshotResponse(
  response: Awaited<ReturnType<Pick<RpcClient, 'sendRequest'>['sendRequest']>>,
  source: MobileStructuredContextSource
): MobileStructuredContextSnapshot {
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to read the context change.')
  }
  const snapshot = SnapshotSchema.parse(response.result)
  if (
    snapshot.sessionId !== source.sessionId ||
    snapshot.workspaceId !== source.workspaceId ||
    snapshot.providerSessionId !== source.providerSessionId
  ) {
    throw new Error('The host returned context state for another session.')
  }
  return snapshot
}
