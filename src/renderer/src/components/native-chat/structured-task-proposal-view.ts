import type {
  AgentSessionBranchNotice,
  AgentSessionBranchProposal
} from '../../../../shared/agent-session-branch-proposal'
import type { AgentSessionBranchesResult } from '../../../../shared/agent-session-branch'
import type {
  StructuredTaskProposalItemResult,
  StructuredTaskProposalRelatedThread
} from '../../../../shared/structured-task-proposal'
import type { latestStructuredTaskProposalSource } from '../../../../shared/structured-task-proposal-source'
import type { StructuredTaskProposalSource } from '../../../../shared/structured-task-proposal'
import type { AgentSessionExecutionLocation } from '../../../../shared/agent-session-record'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { BacklogRoute } from '@/lib/backlog-rpc'
import { taskProposalFromBranchProposal } from '@/lib/structured-task-proposal-record'

export type StructuredTaskProposalHookArgs = {
  target: RuntimeClientTarget
  sessionId: string
  workspaceId: string
  agent: 'claude' | 'codex'
  epoch: string | null | undefined
  items: readonly AgentJournalRenderItem[] | undefined
  isWorking: boolean
  visible: boolean
  family: AgentSessionBranchesResult
  refreshFamily: () => void
}

export function structuredTaskProposalForRecord(args: {
  record: AgentSessionBranchProposal | null
  source: StructuredTaskProposalSource | null
  sessionId: string
  workspaceId: string
}) {
  if (!args.record) {
    return null
  }
  const matches =
    args.source?.anchor.epoch === args.record.sourceAnchor.epoch &&
    args.source.anchor.itemId === args.record.sourceAnchor.itemId
  return taskProposalFromBranchProposal(
    args.record,
    matches
      ? args.source!
      : {
          sessionId: args.sessionId,
          workspaceId: args.workspaceId,
          kind: 'prompt',
          anchor: args.record.sourceAnchor,
          passages: []
        }
  )
}

export function structuredTaskProposalWorkspaceRoute(
  location: AgentSessionExecutionLocation,
  target: RuntimeClientTarget
): BacklogRoute {
  return {
    workspaceId: location.workspaceId,
    executionHostId: location.executionHostId,
    runtimeEnvironmentId: target.kind === 'environment' ? target.environmentId : null
  }
}

export function structuredTaskProposalSourceKey(
  source: ReturnType<typeof latestStructuredTaskProposalSource>
): string | null {
  return source ? `${source.sessionId}:${source.anchor.epoch}:${source.anchor.itemId}` : null
}

export function restoredStructuredTaskProposalResults(
  proposal: AgentSessionBranchProposal | null,
  family: AgentSessionBranchesResult
): StructuredTaskProposalItemResult[] {
  if (proposal?.state !== 'confirmed') {
    return []
  }
  const branches = new Map(family.branches.map((branch) => [branch.branchId, branch]))
  return proposal.items.map((item) => {
    const branch = branches.get(item.branchId)
    if (!branch || branch.state === 'preparing') {
      return { itemId: item.itemId, branchId: item.branchId, status: 'unknown' }
    }
    return {
      itemId: item.itemId,
      branchId: item.branchId,
      status:
        branch.state === 'failed'
          ? 'failed'
          : item.action.kind === 'attach'
            ? 'attached'
            : 'prepared',
      targetSessionId: branch.target.sessionId,
      ...(branch.error ? { message: branch.error } : {})
    }
  })
}

export function restoredStructuredTaskProposalNotice(
  proposal: AgentSessionBranchProposal | null,
  family: AgentSessionBranchesResult,
  notices: readonly AgentSessionBranchNotice[]
) {
  if (proposal?.state !== 'confirmed') {
    return undefined
  }
  const branches = new Map(family.branches.map((branch) => [branch.branchId, branch]))
  const expected = proposal.items.filter((item) => {
    const state = branches.get(item.branchId)?.state
    return state && state !== 'failed' && state !== 'preparing'
  })
  if (expected.length === 0) {
    return undefined
  }
  const deliveries = expected.map(
    (item) =>
      notices.find((notice) => notice.noticeId === `${item.branchId}-source-notice`)?.delivery
  )
  const rejected = deliveries.find((delivery) => delivery?.status === 'rejected')
  const unknown = deliveries.find((delivery) => delivery?.status !== 'accepted')
  return rejected
    ? { status: 'rejected' as const, ...(rejected.reason ? { message: rejected.reason } : {}) }
    : unknown
      ? { status: 'unknown' as const, ...(unknown.reason ? { message: unknown.reason } : {}) }
      : { status: 'accepted' as const }
}

export function structuredTaskProposalRelatedThreads(
  sessionId: string,
  family: AgentSessionBranchesResult
): StructuredTaskProposalRelatedThread[] {
  const seen = new Set<string>()
  return family.branches.flatMap((branch) => {
    const source = branch.source.sessionId === sessionId
    const target = branch.target.sessionId === sessionId
    if (!source && !target) {
      return []
    }
    const related = source ? branch.target : branch.source
    if (seen.has(related.sessionId)) {
      return []
    }
    seen.add(related.sessionId)
    return [
      {
        sessionId: related.sessionId,
        title: branch.title,
        workspaceId: related.location.workspaceId,
        detail: branch.relationKind
      }
    ]
  })
}
