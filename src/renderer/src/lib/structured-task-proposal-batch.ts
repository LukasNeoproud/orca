import { RuntimeRpcCallError, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  AgentSessionBranchProposal,
  AgentSessionBranchProposalItem
} from '../../../shared/agent-session-branch-proposal'
import type { AgentSessionBranchRecord } from '../../../shared/agent-session-branch'
import type {
  StructuredTaskProposalBatchRequest,
  StructuredTaskProposalBatchResult,
  StructuredTaskProposalItemResult
} from '../../../shared/structured-task-proposal'
import { formatStructuredTaskProposalHandoff } from '../../../shared/structured-task-proposal'
import { createStructuredAgentSessionOperationId } from '../../../shared/structured-agent-session-mutation'
import { conversationDeliveryEnvelope } from './conversation-branch-delivery'
import { conversationBranchError } from './conversation-branch-error'
import {
  attachConversationBranch,
  prepareConversationBranch,
  prepareConversationBranchNotice,
  readConversationFamily,
  sendConversationBranchNotice
} from './structured-conversation-branch-client'

function branchResult(
  item: AgentSessionBranchProposalItem,
  branch: AgentSessionBranchRecord
): StructuredTaskProposalItemResult {
  const status =
    branch.state === 'failed'
      ? 'failed'
      : ['prepared', 'starting', 'started', 'delivery-unverified'].includes(branch.state)
        ? item.action.kind === 'attach'
          ? 'attached'
          : 'prepared'
        : 'unknown'
  return {
    itemId: item.itemId,
    branchId: item.branchId,
    status,
    targetSessionId: branch.target.sessionId,
    ...(branch.error ? { message: branch.error } : {})
  }
}

function handoffContent(item: AgentSessionBranchProposalItem): string {
  return formatStructuredTaskProposalHandoff({
    name: item.title,
    scope: item.scope,
    verification: item.verification,
    context: { content: item.context }
  })
}

function noticeContent(item: AgentSessionBranchProposalItem): string {
  const destination =
    item.action.kind === 'attach'
      ? `the existing related conversation ${item.action.targetSessionId}`
      : `the prepared related conversation ${item.action.targetCreate.envelope.sessionId}`
  return [
    `Orca associated the following scope with ${destination}:`,
    '',
    `**${item.title}**`,
    item.scope,
    '',
    item.action.kind === 'attach'
      ? 'No new conversation or agent was created. Do not duplicate this scope here unless the user asks.'
      : 'The related conversation is prepared but no agent was started. Do not duplicate this scope here unless the user asks.'
  ].join('\n')
}

async function prepareItem(args: {
  target: RuntimeClientTarget
  proposal: AgentSessionBranchProposal
  item: AgentSessionBranchProposalItem
  existing?: AgentSessionBranchRecord
}): Promise<StructuredTaskProposalItemResult> {
  if (
    args.existing &&
    (args.existing.providerFork || !['failed', 'preparing'].includes(args.existing.state))
  ) {
    return branchResult(args.item, args.existing)
  }
  const dependencyBranchIds = args.item.dependencyIds.flatMap((dependencyId) => {
    const dependency = args.proposal.items.find((item) => item.itemId === dependencyId)
    return dependency ? [dependency.branchId] : []
  })
  try {
    const common = {
      branchId: args.item.branchId,
      title: args.item.title,
      sourceSessionId: args.proposal.sourceSessionId,
      expectedEpoch: args.proposal.sourceAnchor.epoch,
      sourceItemId: args.proposal.sourceAnchor.itemId,
      relationKind: 'subtask' as const,
      dependsOnBranchIds: dependencyBranchIds,
      handoff: {
        content: handoffContent(args.item),
        sourceItemIds: args.item.sourceItemIds
      }
    }
    const { branch } =
      args.item.action.kind === 'attach'
        ? await attachConversationBranch(args.target, {
            ...common,
            targetSessionId: args.item.action.targetSessionId
          })
        : await prepareConversationBranch(args.target, {
            ...common,
            target: { create: args.item.action.targetCreate },
            handoff: { mode: 'targeted', ...common.handoff }
          })
    return branchResult(args.item, branch)
  } catch (failure) {
    return {
      itemId: args.item.itemId,
      branchId: args.item.branchId,
      status: failure instanceof RuntimeRpcCallError ? 'failed' : 'unknown',
      message: conversationBranchError(failure)
    }
  }
}

async function notifySource(
  target: RuntimeClientTarget,
  proposal: AgentSessionBranchProposal,
  items: readonly AgentSessionBranchProposalItem[]
): Promise<NonNullable<StructuredTaskProposalBatchResult['sourceNotice']> | undefined> {
  const outcomes: ('accepted' | 'rejected' | 'unknown')[] = []
  let message: string | undefined
  for (const item of items) {
    try {
      const content = noticeContent(item)
      const { notice } = await prepareConversationBranchNotice(target, {
        noticeId: `${item.branchId}-source-notice`,
        sourceSessionId: proposal.sourceSessionId,
        branchIds: [item.branchId],
        content
      })
      if (notice.delivery?.status === 'accepted') {
        outcomes.push('accepted')
        continue
      }
      const clientOperationId =
        (notice.delivery?.status === 'pending' || notice.delivery?.status === 'unknown'
          ? notice.delivery.clientMessageId
          : null) ?? createStructuredAgentSessionOperationId(() => crypto.randomUUID())
      const envelope = await conversationDeliveryEnvelope(
        target,
        proposal.sourceSessionId,
        clientOperationId,
        content
      )
      const sent = await sendConversationBranchNotice(target, {
        noticeId: notice.noticeId,
        envelope,
        ...(notice.delivery?.status === 'unknown' ? { retryUnknown: true } : {})
      })
      const status = sent.notice.delivery?.status
      outcomes.push(
        status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'unknown'
      )
      message ??= sent.notice.delivery?.reason ?? undefined
    } catch (failure) {
      outcomes.push('unknown')
      message ??= conversationBranchError(failure)
    }
  }
  if (outcomes.length === 0) {
    return undefined
  }
  return {
    status: outcomes.includes('rejected')
      ? 'rejected'
      : outcomes.includes('unknown')
        ? 'unknown'
        : 'accepted',
    ...(message ? { message } : {})
  }
}

export async function prepareStructuredTaskProposalBatch(args: {
  target: RuntimeClientTarget
  proposal: AgentSessionBranchProposal
  request: StructuredTaskProposalBatchRequest
}): Promise<StructuredTaskProposalBatchResult> {
  const requestedIds = new Set(args.request.items.map((item) => item.itemId))
  const items = args.proposal.items.filter((item) => requestedIds.has(item.itemId))
  const family = await readConversationFamily(args.target, args.proposal.sourceSessionId)
  const existing = new Map(family.branches.map((branch) => [branch.branchId, branch]))
  const results = await Promise.all(
    items.map((item) =>
      prepareItem({
        target: args.target,
        proposal: args.proposal,
        item,
        existing: existing.get(item.branchId)
      })
    )
  )
  const successfulIds = new Set(
    results
      .filter((result) => result.status === 'prepared' || result.status === 'attached')
      .map((result) => result.itemId)
  )
  const sourceNotice = await notifySource(
    args.target,
    args.proposal,
    items.filter((item) => successfulIds.has(item.itemId))
  )
  return { items: results, ...(sourceNotice ? { sourceNotice } : {}) }
}
