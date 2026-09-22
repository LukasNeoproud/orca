import type {
  AgentSessionBranchAttachParams,
  AgentSessionBranchRecord,
  AgentSessionBranchResultPrepareParams,
  AgentSessionBranchResultSendParams
} from '../../../shared/agent-session-branch'
import { structuredAgentSessionSendBody } from '../../../shared/structured-agent-session-outbox'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import type { StructuredAgentSessionCaller } from './structured-agent-session-host-types'
import {
  AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES,
  agentSessionBranchContentHash,
  readAgentSessionBranchContext
} from './structured-agent-session-branch-context'
import { samePreparedAgentSessionBranch } from './structured-agent-session-branch-service'

function sameOwner(
  left: AgentSessionBranchRecord['source']['location'],
  right: AgentSessionBranchRecord['target']['location']
) {
  return left.executionHostId === right.executionHostId && left.wslDistro === right.wslDistro
}

export async function attachExistingAgentSessionBranch(input: {
  host: StructuredAgentSessionHost
  params: AgentSessionBranchAttachParams
}): Promise<AgentSessionBranchRecord> {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  if (
    input.params.sourceSessionId === input.params.targetSessionId ||
    store.wouldCreateCycle(input.params.sourceSessionId, input.params.targetSessionId)
  ) {
    throw new Error('agent_session_branch_cycle')
  }
  const context = await readAgentSessionBranchContext(
    input.host,
    {
      sourceSessionId: input.params.sourceSessionId,
      expectedEpoch: input.params.expectedEpoch,
      sourceItemId: input.params.sourceItemId
    },
    { allowUserAnchor: true }
  )
  const target = input.host.deps.store.getRecord(input.params.targetSessionId)
  if (!target) {
    throw new Error('agent_session_branch_target_missing')
  }
  if (!sameOwner(context.sourceLocation, target.location)) {
    throw new Error('agent_session_branch_execution_owner_mismatch')
  }
  if (!input.params.handoff.sourceItemIds.every((id) => context.sourceItemIds.includes(id))) {
    throw new Error('agent_session_branch_source_selection_invalid')
  }
  const content = input.params.handoff.content
  if (
    !content.trim() ||
    Buffer.byteLength(content, 'utf8') > AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES
  ) {
    throw new Error('agent_session_branch_content_limit')
  }
  const now = Date.now()
  const branch: AgentSessionBranchRecord = {
    schemaVersion: 1,
    branchId: input.params.branchId,
    title: input.params.title,
    relationKind: input.params.relationKind,
    dependsOnBranchIds: input.params.dependsOnBranchIds ?? [],
    source: {
      sessionId: input.params.sourceSessionId,
      agent: context.sourceAgent,
      location: context.sourceLocation,
      anchor: { epoch: input.params.expectedEpoch, itemId: input.params.sourceItemId },
      excerpt: context.excerpt
    },
    target: { sessionId: target.sessionId, agent: target.provider, location: target.location },
    handoff: {
      mode: 'targeted',
      mechanism: 'relationship-only',
      content,
      contentSha256: agentSessionBranchContentHash(content),
      sourceItemIds: input.params.handoff.sourceItemIds,
      historyPreview: null,
      historyPreviewSha256: null
    },
    providerFork: null,
    state: 'started',
    delivery: null,
    error: null,
    createdAt: now,
    updatedAt: now
  }
  return store.runExclusive(`attach:${branch.branchId}`, async () => {
    const existing = store.get(branch.branchId)
    if (existing && !samePreparedAgentSessionBranch(existing, branch)) {
      throw new Error('agent_session_branch_operation_conflict')
    }
    return existing ?? store.put(branch)
  })
}

export async function prepareAgentSessionBranchResult(input: {
  host: StructuredAgentSessionHost
  params: AgentSessionBranchResultPrepareParams
}) {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  return store.runExclusive(`result:${input.params.returnId}`, async () => {
    const branch = store.get(input.params.branchId)
    if (!branch) {
      throw new Error('agent_session_branch_missing')
    }
    const content = input.params.content
    if (
      !content.trim() ||
      Buffer.byteLength(content, 'utf8') > AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES
    ) {
      throw new Error('agent_session_branch_content_limit')
    }
    const hash = agentSessionBranchContentHash(content)
    const existing = store.getReturn(input.params.returnId)
    if (existing) {
      if (existing.branchId !== branch.branchId || existing.contentSha256 !== hash) {
        throw new Error('agent_session_branch_operation_conflict')
      }
      return existing
    }
    const now = Date.now()
    return store.putReturn({
      schemaVersion: 1,
      returnId: input.params.returnId,
      branchId: branch.branchId,
      sourceSessionId: branch.target.sessionId,
      targetSessionId: branch.source.sessionId,
      content,
      contentSha256: hash,
      delivery: null,
      integrationState: 'reported',
      createdAt: now,
      updatedAt: now
    })
  })
}

export async function sendAgentSessionBranchResult(input: {
  host: StructuredAgentSessionHost
  caller: StructuredAgentSessionCaller
  params: AgentSessionBranchResultSendParams
}) {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  return store.runExclusive(`result-send:${input.params.returnId}`, async () => {
    const artifact = store.getReturn(input.params.returnId)
    if (!artifact) {
      throw new Error('agent_session_branch_result_missing')
    }
    if (input.params.envelope.sessionId !== artifact.targetSessionId) {
      throw new Error('agent_session_branch_target_mismatch')
    }
    if (artifact.delivery?.status === 'accepted') {
      if (artifact.delivery.clientMessageId !== input.params.envelope.clientOperationId) {
        throw new Error('agent_session_branch_result_already_sent')
      }
      return artifact
    }
    if (
      (artifact.delivery?.status === 'pending' || artifact.delivery?.status === 'unknown') &&
      artifact.delivery.clientMessageId !== input.params.envelope.clientOperationId
    ) {
      throw new Error('agent_session_branch_delivery_in_flight')
    }
    const submittedAt = Date.now()
    await store.putReturn({
      ...artifact,
      delivery: {
        clientMessageId: input.params.envelope.clientOperationId,
        status: 'pending',
        reason: null,
        submittedAt,
        resolvedAt: null
      },
      updatedAt: submittedAt
    })
    const holder = `branch-result:${artifact.returnId}`
    let held = false
    try {
      await input.host.hold(artifact.targetSessionId, holder, { resume: true })
      held = true
      const result = await input.host.send(input.caller, {
        envelope: input.params.envelope,
        ...(input.params.retryUnknown ? { retryUnknown: true as const } : {}),
        body: structuredAgentSessionSendBody(artifact.content, [])
      })
      const delivery = result.ok
        ? {
            clientMessageId: result.value.submission.clientMessageId,
            status: result.value.submission.dispatchState,
            reason: result.value.submission.reason,
            submittedAt: result.value.submission.submittedAt,
            resolvedAt: result.value.submission.resolvedAt
          }
        : {
            clientMessageId: input.params.envelope.clientOperationId,
            status:
              result.refusal.code === 'agent_session_operation_unknown'
                ? ('unknown' as const)
                : ('rejected' as const),
            reason: result.refusal.message,
            submittedAt,
            resolvedAt: Date.now()
          }
      return store.putReturn({ ...artifact, delivery, updatedAt: Date.now() })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return store.putReturn({
        ...artifact,
        delivery: {
          clientMessageId: input.params.envelope.clientOperationId,
          status: 'unknown',
          reason,
          submittedAt,
          resolvedAt: Date.now()
        },
        updatedAt: Date.now()
      })
    } finally {
      if (held) {
        input.host.release(artifact.targetSessionId, holder)
      }
    }
  })
}
