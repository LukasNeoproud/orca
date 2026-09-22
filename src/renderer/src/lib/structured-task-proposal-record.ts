import type {
  AgentSessionBranchProposal,
  AgentSessionBranchProposalItem
} from '../../../shared/agent-session-branch-proposal'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams
} from '../../../shared/structured-agent-session-create'
import type {
  StructuredTaskProposal,
  StructuredTaskProposalBatchRequest,
  StructuredTaskProposalItem
} from '../../../shared/structured-task-proposal'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

type SupportedAgent = 'claude' | 'codex'

function targetCreate(item: StructuredTaskProposalItem, agent: SupportedAgent) {
  const sessionId = createStructuredAgentSessionId(agent, () => crypto.randomUUID())
  return structuredAgentSessionCreateParams({
    sessionId,
    worktree: toRuntimeWorktreeSelector(item.workspaceId),
    agent,
    randomUuid: () => crypto.randomUUID()
  })
}

function proposalItem(
  item: StructuredTaskProposalItem,
  agent: SupportedAgent
): AgentSessionBranchProposalItem {
  return {
    itemId: item.itemId,
    branchId: item.branchId,
    title: item.name,
    scope: item.scope,
    verification: item.verification,
    uncertain: item.uncertain,
    dependencyIds: item.dependencyIds,
    workspaceId: item.workspaceId,
    context: item.context.content,
    sourceItemIds: item.context.sourceItemIds,
    action:
      item.action === 'attach' && item.targetSessionId
        ? { kind: 'attach', targetSessionId: item.targetSessionId }
        : { kind: 'prepare', targetCreate: targetCreate(item, agent) }
  }
}

export function newAgentSessionBranchProposal(
  proposal: StructuredTaskProposal,
  agent: SupportedAgent,
  now = Date.now()
): AgentSessionBranchProposal {
  return {
    schemaVersion: 1,
    proposalId: proposal.proposalId,
    sourceSessionId: proposal.source.sessionId,
    sourceAnchor: proposal.source.anchor,
    revision: 1,
    state: 'offered',
    items: proposal.items.map((item) => proposalItem(item, agent)),
    createdAt: now,
    updatedAt: now
  }
}

export function confirmedAgentSessionBranchProposal(
  current: AgentSessionBranchProposal,
  request: StructuredTaskProposalBatchRequest,
  agent: SupportedAgent,
  now = Date.now()
): AgentSessionBranchProposal {
  const previous = new Map(current.items.map((item) => [item.itemId, item]))
  const items = request.items.map((item): AgentSessionBranchProposalItem => {
    const prior = previous.get(item.itemId)
    const unchangedCreate =
      item.action === 'prepare' &&
      prior?.action.kind === 'prepare' &&
      prior.workspaceId === item.workspaceId
        ? prior.action.targetCreate
        : null
    return {
      itemId: item.itemId,
      branchId: item.branchId,
      title: item.name,
      scope: item.scope,
      verification: item.verification,
      uncertain: prior?.uncertain ?? false,
      dependencyIds: item.dependencyIds,
      workspaceId: item.workspaceId,
      context: item.context.content,
      sourceItemIds: item.context.sourceItemIds,
      action:
        item.action === 'attach' && item.targetSessionId
          ? { kind: 'attach', targetSessionId: item.targetSessionId }
          : {
              kind: 'prepare',
              targetCreate:
                unchangedCreate ??
                targetCreate(
                  {
                    ...item,
                    relationKind: 'subtask',
                    action: 'prepare',
                    uncertain: prior?.uncertain ?? false
                  },
                  agent
                )
            }
    }
  })
  return {
    ...current,
    revision: current.revision + 1,
    state: 'confirmed',
    items,
    updatedAt: now
  }
}

export function taskProposalFromBranchProposal(
  record: AgentSessionBranchProposal,
  source: StructuredTaskProposal['source']
): StructuredTaskProposal {
  return {
    proposalId: record.proposalId,
    source: {
      ...source,
      sessionId: record.sourceSessionId,
      anchor: record.sourceAnchor
    },
    items: record.items.map((item) => ({
      itemId: item.itemId,
      branchId: item.branchId,
      name: item.title,
      scope: item.scope,
      verification: item.verification,
      dependencyIds: item.dependencyIds,
      workspaceId: item.workspaceId,
      context: { content: item.context, sourceItemIds: item.sourceItemIds },
      relationKind: 'subtask',
      action: item.action.kind,
      ...(item.action.kind === 'attach' ? { targetSessionId: item.action.targetSessionId } : {}),
      uncertain: item.uncertain
    })),
    shouldOffer: record.items.length > 1,
    analysis: 'deterministic',
    truncated: false
  }
}

export function branchProposalMatchesRequest(
  record: AgentSessionBranchProposal,
  request: StructuredTaskProposalBatchRequest
): boolean {
  const requested = new Map(request.items.map((item) => [item.itemId, item]))
  return request.items.every((item) => {
    const saved = record.items.find((candidate) => candidate.itemId === item.itemId)
    return Boolean(
      saved &&
      saved.branchId === item.branchId &&
      saved.title === item.name &&
      saved.scope === item.scope &&
      saved.verification === item.verification &&
      saved.workspaceId === item.workspaceId &&
      saved.context === item.context.content &&
      JSON.stringify(saved.dependencyIds) === JSON.stringify(item.dependencyIds) &&
      requested.has(item.itemId) &&
      (item.action === 'prepare'
        ? saved.action.kind === 'prepare'
        : saved.action.kind === 'attach' && saved.action.targetSessionId === item.targetSessionId)
    )
  })
}
