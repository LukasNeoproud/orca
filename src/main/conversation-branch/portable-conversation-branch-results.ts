import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type {
  PortableConversationBranchResultBeginParams,
  PortableConversationBranchResultBeginResult,
  PortableConversationBranchResultCompleteParams,
  PortableConversationBranchResultPrepareParams,
  PortableConversationReturnArtifact
} from '../../shared/portable-conversation-branch'
import {
  isPortableConversationBranchRecord,
  portableConversationContentHash
} from './portable-conversation-branch-service'

const MAX_CONTENT_BYTES = 256 * 1024

export async function preparePortableConversationBranchResult(
  store: AgentSessionBranchStore,
  params: PortableConversationBranchResultPrepareParams,
  now = Date.now()
): Promise<PortableConversationReturnArtifact> {
  return store.runExclusive(`result:${params.returnId}`, async () => {
    const branch = store.get(params.branchId)
    if (!branch || !isPortableConversationBranchRecord(branch)) {
      throw new Error('portable_conversation_branch_missing')
    }
    if (!params.content.trim() || Buffer.byteLength(params.content) > MAX_CONTENT_BYTES) {
      throw new Error('portable_conversation_branch_content_limit')
    }
    const contentSha256 = portableConversationContentHash(params.content)
    const existing = store.getReturn(params.returnId)
    if (existing) {
      if (
        !isPortableResult(existing) ||
        existing.branchId !== branch.branchId ||
        existing.contentSha256 !== contentSha256
      ) {
        throw new Error('portable_conversation_branch_operation_conflict')
      }
      return existing as PortableConversationReturnArtifact
    }
    const artifact: PortableConversationReturnArtifact = {
      schemaVersion: 1,
      returnId: params.returnId,
      branchId: branch.branchId,
      sourceSessionId: branch.target.sessionId,
      targetSessionId: branch.source.sessionId,
      content: params.content,
      contentSha256,
      delivery: null,
      integrationState: 'reported',
      portable: { attemptId: null },
      createdAt: now,
      updatedAt: now
    }
    return (await store.putReturn(artifact)) as PortableConversationReturnArtifact
  })
}

export async function beginPortableConversationBranchResult(
  store: AgentSessionBranchStore,
  params: PortableConversationBranchResultBeginParams,
  now = Date.now()
): Promise<PortableConversationBranchResultBeginResult> {
  return store.runExclusive(`result-send:${params.returnId}`, async () => {
    const artifact = requirePortableResult(store, params.returnId)
    const delivery = artifact.delivery
    if (delivery?.status === 'accepted') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_branch_result_already_sent')
      }
      return { result: artifact, authorized: false }
    }
    if (delivery?.status === 'pending' || delivery?.status === 'unknown') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_branch_delivery_in_flight')
      }
      return { result: artifact, authorized: false }
    }
    const pending: PortableConversationReturnArtifact = {
      ...artifact,
      delivery: {
        clientMessageId: params.attemptId,
        status: 'pending',
        reason: null,
        submittedAt: now,
        resolvedAt: null
      },
      portable: { attemptId: params.attemptId },
      updatedAt: now
    }
    const result = (await store.putReturn(pending)) as PortableConversationReturnArtifact
    return { result, authorized: true }
  })
}

export async function completePortableConversationBranchResult(
  store: AgentSessionBranchStore,
  params: PortableConversationBranchResultCompleteParams,
  now = Date.now()
): Promise<PortableConversationReturnArtifact> {
  return store.runExclusive(`result-send:${params.returnId}`, async () => {
    const artifact = requirePortableResult(store, params.returnId)
    if (
      artifact.portable.attemptId !== params.attemptId ||
      artifact.delivery?.clientMessageId !== params.attemptId
    ) {
      throw new Error('portable_conversation_branch_attempt_mismatch')
    }
    if (artifact.delivery.status !== 'pending') {
      return artifact
    }
    return (await store.putReturn({
      ...artifact,
      delivery: {
        ...artifact.delivery,
        status: params.status,
        reason: params.reason ?? null,
        resolvedAt: now
      },
      updatedAt: now
    })) as PortableConversationReturnArtifact
  })
}

function requirePortableResult(
  store: AgentSessionBranchStore,
  returnId: string
): PortableConversationReturnArtifact {
  const artifact = store.getReturn(returnId)
  if (!artifact) {
    throw new Error('portable_conversation_branch_result_missing')
  }
  if (!isPortableResult(artifact)) {
    throw new Error('portable_conversation_branch_result_kind_mismatch')
  }
  return artifact as PortableConversationReturnArtifact
}

function isPortableResult(value: object): value is PortableConversationReturnArtifact {
  if (!('portable' in value)) {
    return false
  }
  const portable = value.portable
  return (
    typeof portable === 'object' &&
    portable !== null &&
    'attemptId' in portable &&
    (portable.attemptId === null || typeof portable.attemptId === 'string')
  )
}
