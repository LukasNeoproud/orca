import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationWorkspace } from '../runtime/portable-conversation-workspace'
import {
  portableConversationSourceSessionId,
  type PortableConversationBranchPrepareParams
} from '../../shared/portable-conversation-branch'
import type {
  PortableConversationProposalAnalyzeParams,
  PortableConversationProposalAnalyzeResult,
  PortableConversationProposalConfirmResult,
  PortableConversationProposalItem,
  PortableConversationProposalRecord
} from '../../shared/portable-conversation-proposal'
import type { PortableConversationSourceContext } from '../../shared/portable-conversation-source'
import {
  formatStructuredTaskProposalHandoff,
  type StructuredTaskProposalItemResult
} from '../../shared/structured-task-proposal'
import { createStructuredTaskProposal } from '../../shared/structured-task-proposal-analysis'
import { attachExistingPortableConversationBranch } from './portable-conversation-branch-attach'
import { validatePortableConversationProposalIntents } from './portable-conversation-proposal-intent'
import { preparePortableConversationProposalNotice } from './portable-conversation-proposal-notice'
import {
  portableConversationContentHash,
  preparePortableConversationBranch
} from './portable-conversation-branch-service'
import type { PortableConversationProposalStore } from './portable-conversation-proposal-store'

export type PortableConversationProposalDependencies = {
  store: PortableConversationProposalStore
  branchStore: AgentSessionBranchStore
  readContext: (input: {
    source: PortableConversationProposalAnalyzeParams['source']
    anchor: PortableConversationProposalAnalyzeParams['anchor']
    mode: 'targeted'
    anchorRole: 'user' | 'assistant'
  }) => Promise<PortableConversationSourceContext>
  readSession: (source: PortableConversationProposalAnalyzeParams['source']) => Promise<unknown>
  resolveWorkspace: (
    workspaceId: string,
    executionHostId: string
  ) => Promise<PortableConversationWorkspace>
  now?: () => number
}

export async function analyzePortableConversationProposal(
  dependencies: PortableConversationProposalDependencies,
  params: PortableConversationProposalAnalyzeParams
): Promise<PortableConversationProposalAnalyzeResult> {
  const [workspace, context] = await Promise.all([
    dependencies.resolveWorkspace(params.source.workspace.id, params.source.executionHostId),
    dependencies.readContext({
      source: params.source,
      anchor: params.anchor,
      mode: 'targeted',
      anchorRole: params.kind === 'prompt' ? 'user' : 'assistant'
    })
  ])
  if (
    workspace.path !== params.source.workspace.path ||
    workspace.kind !== params.source.workspace.kind
  ) {
    throw new Error('portable_conversation_workspace_changed')
  }
  const sessionId = portableConversationSourceSessionId(params.source)
  const proposal = createStructuredTaskProposal({
    sessionId,
    workspaceId: workspace.workspaceId,
    kind: params.kind,
    anchor: { epoch: context.identity.fingerprint, itemId: params.anchor.messageId },
    passages: [{ itemId: params.anchor.messageId, text: context.selectedPassage }]
  })
  return {
    proposal,
    proof: {
      source: params.source,
      anchor: params.anchor,
      identity: context.identity,
      contextSha256: portableConversationContentHash(context.contextMarkdown),
      projectId: workspace.projectId
    }
  }
}

export async function confirmPortableConversationProposal(
  dependencies: PortableConversationProposalDependencies,
  proposalId: string,
  expectedRevision: number,
  itemIds?: readonly string[]
): Promise<PortableConversationProposalConfirmResult> {
  return dependencies.store.runExclusive(`confirm:${proposalId}`, async () => {
    let record = dependencies.store.get(proposalId)
    if (!record) {
      throw new Error('portable_conversation_proposal_missing')
    }
    if (record.revision !== expectedRevision && record.state !== 'confirmed') {
      throw new Error('portable_conversation_proposal_stale')
    }
    validatePortableConversationProposalIntents(record)
    const proposalItems = record.proposal.items
    if (itemIds?.some((itemId) => !proposalItems.some((item) => item.itemId === itemId))) {
      throw new Error('portable_conversation_proposal_item_missing')
    }
    if (record.state !== 'confirmed') {
      record = await dependencies.store.put(
        {
          ...record,
          state: 'confirmed',
          revision: record.revision + 1,
          updatedAt: dependencies.now?.() ?? Date.now()
        },
        record.revision
      )
    }
    const selected = itemIds ? new Set(itemIds) : null
    for (const item of record.proposal.items) {
      if (selected && !selected.has(item.itemId)) {
        continue
      }
      if (item.intent.kind === 'reject' || item.action === 'reject') {
        continue
      }
      const prior = record.results.find((result) => result.itemId === item.itemId)
      if (prior?.status === 'prepared' || prior?.status === 'attached') {
        continue
      }
      const result = await prepareProposalItem(dependencies, record, item)
      record = await dependencies.store.replace({
        ...record,
        results: [...record.results.filter((entry) => entry.itemId !== item.itemId), result],
        updatedAt: dependencies.now?.() ?? Date.now()
      })
    }
    await preparePortableConversationProposalNotice(
      dependencies.store,
      record,
      dependencies.now?.()
    )
    const notices = dependencies.store.notices(proposalId)
    const noticeStatus = notices.some((notice) => notice.delivery?.status === 'rejected')
      ? 'rejected'
      : notices.length > 0 && notices.every((notice) => notice.delivery?.status === 'accepted')
        ? 'accepted'
        : 'unknown'
    const noticeReason = notices.find((notice) => notice.delivery?.reason)?.delivery?.reason
    return {
      proposal: record,
      batch: {
        items: record.results,
        ...(notices.length > 0
          ? {
              sourceNotice: {
                status: noticeStatus,
                ...(noticeReason ? { message: noticeReason } : {})
              }
            }
          : {})
      }
    }
  })
}

async function prepareProposalItem(
  dependencies: PortableConversationProposalDependencies,
  record: PortableConversationProposalRecord,
  item: PortableConversationProposalItem
): Promise<StructuredTaskProposalItemResult> {
  try {
    const target = await proposalTarget(dependencies, item)
    const params: PortableConversationBranchPrepareParams = {
      branchId: item.branchId,
      title: item.name,
      relationKind: 'subtask',
      dependsOnBranchIds: dependencyBranchIds(record, item),
      source: record.portable.source,
      anchor: record.portable.anchor,
      anchorRole: record.proposal.source.kind === 'prompt' ? 'user' : 'assistant',
      target,
      handoff: {
        mode: 'targeted',
        content: formatStructuredTaskProposalHandoff(item),
        sourceContextSha256: record.portable.contextSha256
      }
    }
    const prepared = await preparePortableConversationBranch(
      {
        store: dependencies.branchStore,
        readContext: (request) =>
          dependencies.readContext({
            source: request.source,
            anchor: request.anchor,
            mode: 'targeted',
            anchorRole:
              request.anchorRole ??
              (record.proposal.source.kind === 'prompt' ? 'user' : 'assistant')
          }),
        resolveWorkspace: dependencies.resolveWorkspace,
        now: dependencies.now
      },
      params
    )
    const branch =
      item.intent.kind === 'attach'
        ? await attachExistingPortableConversationBranch(
            dependencies.branchStore,
            prepared.branchId,
            item.intent.target
          )
        : prepared
    return {
      itemId: item.itemId,
      branchId: item.branchId,
      status: item.intent.kind === 'attach' ? 'attached' : 'prepared',
      targetSessionId: branch.target.sessionId
    }
  } catch (error) {
    return {
      itemId: item.itemId,
      branchId: item.branchId,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function proposalTarget(
  dependencies: PortableConversationProposalDependencies,
  item: PortableConversationProposalItem
): Promise<PortableConversationBranchPrepareParams['target']> {
  if (item.intent.kind === 'prepare') {
    if (
      item.action !== 'prepare' ||
      item.workspaceId !== item.intent.workspaceId ||
      item.targetSessionId !== item.intent.targetSessionId
    ) {
      throw new Error('portable_conversation_proposal_intent_mismatch')
    }
    return {
      sessionId: item.intent.targetSessionId,
      agent: item.intent.agent,
      workspaceId: item.intent.workspaceId,
      executionHostId: item.intent.executionHostId
    }
  }
  if (item.intent.kind !== 'attach' || item.action !== 'attach') {
    throw new Error('portable_conversation_proposal_intent_mismatch')
  }
  if (
    item.workspaceId !== item.intent.target.workspace.id ||
    item.targetSessionId !== portableConversationSourceSessionId(item.intent.target)
  ) {
    throw new Error('portable_conversation_proposal_intent_mismatch')
  }
  await dependencies.readSession(item.intent.target)
  return {
    sessionId: portableConversationSourceSessionId(item.intent.target),
    agent: item.intent.target.provider.agent,
    workspaceId: item.intent.target.workspace.id,
    executionHostId: item.intent.target.executionHostId
  }
}

function dependencyBranchIds(
  record: PortableConversationProposalRecord,
  item: PortableConversationProposalItem
): string[] {
  return item.dependencyIds.flatMap((dependencyId) => {
    const dependency = record.proposal.items.find((candidate) => candidate.itemId === dependencyId)
    return dependency ? [dependency.branchId] : []
  })
}
