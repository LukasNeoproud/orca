import type {
  AgentSessionBranchNoticePrepareParams,
  AgentSessionBranchNoticeSendParams
} from '../../../shared/agent-session-branch-proposal'
import { structuredAgentSessionSendBody } from '../../../shared/structured-agent-session-outbox'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import type { StructuredAgentSessionCaller } from './structured-agent-session-host-types'
import {
  AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES,
  agentSessionBranchContentHash
} from './structured-agent-session-branch-context'

export async function prepareAgentSessionBranchNotice(input: {
  host: StructuredAgentSessionHost
  params: AgentSessionBranchNoticePrepareParams
}) {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  return store.runExclusive(`notice:${input.params.noticeId}`, async () => {
    const branches = input.params.branchIds.map((branchId) => store.get(branchId))
    if (
      branches.some((branch) => !branch || branch.source.sessionId !== input.params.sourceSessionId)
    ) {
      throw new Error('agent_session_branch_notice_scope_invalid')
    }
    const content = input.params.content.trim()
    if (!content || Buffer.byteLength(content, 'utf8') > AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES) {
      throw new Error('agent_session_branch_content_limit')
    }
    const contentSha256 = agentSessionBranchContentHash(content)
    const existing = store.getNotice(input.params.noticeId)
    if (existing) {
      if (
        existing.sourceSessionId !== input.params.sourceSessionId ||
        existing.contentSha256 !== contentSha256 ||
        JSON.stringify(existing.branchIds) !== JSON.stringify(input.params.branchIds)
      ) {
        throw new Error('agent_session_branch_operation_conflict')
      }
      return existing
    }
    const now = Date.now()
    return store.putNotice({
      schemaVersion: 1,
      noticeId: input.params.noticeId,
      sourceSessionId: input.params.sourceSessionId,
      branchIds: input.params.branchIds,
      content,
      contentSha256,
      delivery: null,
      createdAt: now,
      updatedAt: now
    })
  })
}

export async function sendAgentSessionBranchNotice(input: {
  host: StructuredAgentSessionHost
  caller: StructuredAgentSessionCaller
  params: AgentSessionBranchNoticeSendParams
}) {
  const store = input.host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  return store.runExclusive(`notice-send:${input.params.noticeId}`, async () => {
    const notice = store.getNotice(input.params.noticeId)
    if (!notice) {
      throw new Error('agent_session_branch_notice_missing')
    }
    if (input.params.envelope.sessionId !== notice.sourceSessionId) {
      throw new Error('agent_session_branch_target_mismatch')
    }
    if (notice.delivery?.status === 'accepted') {
      if (notice.delivery.clientMessageId !== input.params.envelope.clientOperationId) {
        throw new Error('agent_session_branch_notice_already_sent')
      }
      return notice
    }
    if (
      (notice.delivery?.status === 'pending' || notice.delivery?.status === 'unknown') &&
      notice.delivery.clientMessageId !== input.params.envelope.clientOperationId
    ) {
      throw new Error('agent_session_branch_delivery_in_flight')
    }
    const submittedAt = Date.now()
    await store.putNotice({
      ...notice,
      delivery: {
        clientMessageId: input.params.envelope.clientOperationId,
        status: 'pending',
        reason: null,
        submittedAt,
        resolvedAt: null
      },
      updatedAt: submittedAt
    })
    const holder = `branch-notice:${notice.noticeId}`
    let held = false
    try {
      await input.host.hold(notice.sourceSessionId, holder, { resume: true })
      held = true
      const result = await input.host.send(input.caller, {
        envelope: input.params.envelope,
        ...(input.params.retryUnknown ? { retryUnknown: true as const } : {}),
        body: structuredAgentSessionSendBody(notice.content, [])
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
      return store.putNotice({ ...notice, delivery, updatedAt: Date.now() })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return store.putNotice({
        ...notice,
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
        input.host.release(notice.sourceSessionId, holder)
      }
    }
  })
}
