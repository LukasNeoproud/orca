import type {
  AgentSessionBranchPrepareParams,
  AgentSessionBranchRecord,
  AgentSessionBranchStartParams
} from '../../../shared/agent-session-branch'
import { agentSessionExecutionLocationsEqual } from '../../../shared/agent-session-record'
import { structuredAgentSessionSendBody } from '../../../shared/structured-agent-session-outbox'
import type { AgentSessionWireRefusal } from '../../../shared/agent-session-wire'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import type { StructuredAgentSessionCaller } from './structured-agent-session-host-types'
import {
  AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES,
  agentSessionBranchContentHash,
  readAgentSessionBranchContext
} from './structured-agent-session-branch-context'

function sameExecutionOwner(
  left: AgentSessionBranchRecord['source']['location'],
  right: AgentSessionBranchRecord['target']['location']
): boolean {
  return left.executionHostId === right.executionHostId && left.wslDistro === right.wslDistro
}

export async function buildPreparedAgentSessionBranch(input: {
  host: StructuredAgentSessionHost
  params: AgentSessionBranchPrepareParams
  targetLocation: AgentSessionBranchRecord['target']['location']
  now?: number
}): Promise<AgentSessionBranchRecord> {
  const context = await readAgentSessionBranchContext(
    input.host,
    {
      sourceSessionId: input.params.sourceSessionId,
      expectedEpoch: input.params.expectedEpoch,
      sourceItemId: input.params.sourceItemId
    },
    { allowUserAnchor: input.params.handoff.mode === 'targeted' }
  )
  if (!sameExecutionOwner(context.sourceLocation, input.targetLocation)) {
    throw new Error('agent_session_branch_execution_owner_mismatch')
  }
  const handoff = input.params.handoff
  if (handoff.mode === 'preserve-history' && !context.nativeProviderForkSupported) {
    throw new Error('agent_session_branch_provider_unsupported')
  }
  if (
    handoff.mode === 'preserve-history' &&
    (!context.historyPreview || !context.historyPreviewSha256)
  ) {
    throw new Error('agent_session_branch_history_limit')
  }
  const content = handoff.mode === 'preserve-history' ? handoff.instruction : handoff.content
  if (
    !content.trim() ||
    Buffer.byteLength(content, 'utf8') > AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES
  ) {
    throw new Error('agent_session_branch_content_limit')
  }
  if (
    handoff.mode === 'preserve-history' &&
    handoff.historyPreviewSha256 !== context.historyPreviewSha256
  ) {
    throw new Error('agent_session_branch_preview_stale')
  }
  const sourceItemIds =
    handoff.mode === 'preserve-history' ? context.sourceItemIds : handoff.sourceItemIds
  if (!sourceItemIds.every((id) => context.sourceItemIds.includes(id))) {
    throw new Error('agent_session_branch_source_selection_invalid')
  }
  const now = input.now ?? Date.now()
  return {
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
    target: {
      sessionId: input.params.target.create.envelope.sessionId,
      agent: input.params.target.create.agent,
      location: input.targetLocation,
      create: input.params.target.create
    },
    handoff: {
      mode: handoff.mode,
      mechanism:
        handoff.mode === 'preserve-history' ? 'native-provider-fork' : 'portable-transcript',
      content,
      contentSha256: agentSessionBranchContentHash(content),
      sourceItemIds,
      historyPreview: handoff.mode === 'preserve-history' ? context.historyPreview : null,
      historyPreviewSha256:
        handoff.mode === 'preserve-history' ? context.historyPreviewSha256 : null
    },
    providerFork:
      handoff.mode === 'preserve-history'
        ? {
            sourceProviderSessionId: context.sourceProviderSessionId,
            targetProviderSessionId: null,
            boundaryItemId: input.params.sourceItemId
          }
        : null,
    state: 'preparing',
    delivery: null,
    error: null,
    createdAt: now,
    updatedAt: now
  }
}

export function samePreparedAgentSessionBranch(
  left: AgentSessionBranchRecord,
  right: AgentSessionBranchRecord
): boolean {
  return (
    left.branchId === right.branchId &&
    left.title === right.title &&
    left.relationKind === right.relationKind &&
    JSON.stringify(left.dependsOnBranchIds) === JSON.stringify(right.dependsOnBranchIds) &&
    left.source.sessionId === right.source.sessionId &&
    left.source.anchor.epoch === right.source.anchor.epoch &&
    left.source.anchor.itemId === right.source.anchor.itemId &&
    left.target.sessionId === right.target.sessionId &&
    left.target.agent === right.target.agent &&
    left.target.create?.envelope.clientOperationId ===
      right.target.create?.envelope.clientOperationId &&
    agentSessionExecutionLocationsEqual(left.target.location, right.target.location) &&
    left.handoff.mode === right.handoff.mode &&
    left.handoff.mechanism === right.handoff.mechanism &&
    left.handoff.contentSha256 === right.handoff.contentSha256 &&
    JSON.stringify(left.handoff.sourceItemIds) === JSON.stringify(right.handoff.sourceItemIds) &&
    left.handoff.historyPreviewSha256 === right.handoff.historyPreviewSha256 &&
    left.providerFork?.sourceProviderSessionId === right.providerFork?.sourceProviderSessionId &&
    left.providerFork?.boundaryItemId === right.providerFork?.boundaryItemId
  )
}

export function preparedAgentSessionBranchStartRefusal(
  host: Pick<StructuredAgentSessionHost, 'journalSnapshot'>,
  branch: AgentSessionBranchRecord,
  clientMessageId: string
): AgentSessionWireRefusal | null {
  const changed = host
    .journalSnapshot(branch.target.sessionId)
    .submissions.some((submission) => submission.clientMessageId !== clientMessageId)
  return changed
    ? {
        code: 'agent_session_operation_invalid',
        message: 'The prepared child received another message before this handoff.'
      }
    : null
}

export async function startPreparedAgentSessionBranch(input: {
  host: StructuredAgentSessionHost
  caller: StructuredAgentSessionCaller
  params: AgentSessionBranchStartParams
}): Promise<AgentSessionBranchRecord> {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  return store.runExclusive(`start:${input.params.branchId}`, async () => {
    const branch = store.get(input.params.branchId)
    if (!branch) {
      throw new Error('agent_session_branch_missing')
    }
    if (input.params.envelope.sessionId !== branch.target.sessionId) {
      throw new Error('agent_session_branch_target_mismatch')
    }
    if (branch.delivery?.status === 'accepted') {
      if (branch.delivery.clientMessageId !== input.params.envelope.clientOperationId) {
        throw new Error('agent_session_branch_already_started')
      }
      return branch
    }
    if (
      (branch.delivery?.status === 'pending' || branch.delivery?.status === 'unknown') &&
      branch.delivery.clientMessageId !== input.params.envelope.clientOperationId
    ) {
      throw new Error('agent_session_branch_delivery_in_flight')
    }
    const now = Date.now()
    await store.put({
      ...branch,
      state: 'starting',
      delivery: {
        clientMessageId: input.params.envelope.clientOperationId,
        status: 'pending',
        reason: null,
        submittedAt: now,
        resolvedAt: null
      },
      updatedAt: now
    })
    const holder = `branch-start:${branch.branchId}`
    let held = false
    try {
      await input.host.hold(branch.target.sessionId, holder, { resume: true })
      held = true
      const result = await input.host.send(input.caller, {
        envelope: input.params.envelope,
        ...(input.params.retryUnknown ? { retryUnknown: true as const } : {}),
        body: structuredAgentSessionSendBody(branch.handoff.content, []),
        beforeDispatch: () =>
          preparedAgentSessionBranchStartRefusal(
            input.host,
            branch,
            input.params.envelope.clientOperationId
          )
      })
      const submission = result.ok ? result.value.submission : null
      const unknown = !result.ok && result.refusal.code === 'agent_session_operation_unknown'
      return store.put({
        ...branch,
        state:
          submission?.dispatchState === 'accepted'
            ? 'started'
            : unknown
              ? 'delivery-unverified'
              : 'failed',
        delivery: submission
          ? {
              clientMessageId: submission.clientMessageId,
              status: submission.dispatchState,
              reason: submission.reason,
              submittedAt: submission.submittedAt,
              resolvedAt: submission.resolvedAt
            }
          : {
              clientMessageId: input.params.envelope.clientOperationId,
              status: unknown ? 'unknown' : 'rejected',
              reason: result.ok ? null : result.refusal.message,
              submittedAt: now,
              resolvedAt: Date.now()
            },
        error: submission?.reason ?? (result.ok ? null : result.refusal.message),
        updatedAt: Date.now()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return store.put({
        ...branch,
        state: 'delivery-unverified',
        delivery: {
          clientMessageId: input.params.envelope.clientOperationId,
          status: 'unknown',
          reason: message,
          submittedAt: now,
          resolvedAt: Date.now()
        },
        error: message,
        updatedAt: Date.now()
      })
    } finally {
      if (held) {
        input.host.release(branch.target.sessionId, holder)
      }
    }
  })
}
