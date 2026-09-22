import type { AgentSessionBranchDelivery } from './agent-session-branch'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceIdentity
} from './portable-conversation-source'
import type {
  StructuredTaskProposal,
  StructuredTaskProposalBatchResult,
  StructuredTaskProposalItem
} from './structured-task-proposal'

export type PortableConversationProposalItem = StructuredTaskProposalItem & {
  intent:
    | {
        kind: 'prepare'
        targetSessionId: string
        agent: 'claude' | 'codex'
        workspaceId: string
        executionHostId: `ssh:${string}`
      }
    | { kind: 'attach'; target: PortableConversationSource }
    | { kind: 'reject' }
}

export type PortableConversationProposalRecord = {
  schemaVersion: 1
  proposal: Omit<StructuredTaskProposal, 'items'> & {
    items: PortableConversationProposalItem[]
  }
  portable: {
    source: PortableConversationSource
    anchor: PortableConversationSourceAnchor
    identity: PortableConversationSourceIdentity
    contextSha256: string
    projectId: string
  }
  revision: number
  state: 'offered' | 'dismissed' | 'confirmed'
  results: StructuredTaskProposalBatchResult['items']
  createdAt: number
  updatedAt: number
}

export type PortableConversationProposalAnalyzeParams = {
  source: PortableConversationSource
  anchor: PortableConversationSourceAnchor
  kind: 'prompt' | 'review'
}

export type PortableConversationProposalAnalyzeResult = {
  proposal: StructuredTaskProposal
  proof: PortableConversationProposalRecord['portable']
}

export type PortableConversationProposalPutParams = {
  proposal: PortableConversationProposalRecord
  expectedRevision: number
}

export type PortableConversationProposalGetParams = {
  source: PortableConversationSource
  proposalId?: string
}

export type PortableConversationProposalConfirmParams = {
  proposalId: string
  expectedRevision: number
  itemIds?: string[]
}

export type PortableConversationProposalConfirmResult = {
  proposal: PortableConversationProposalRecord
  batch: StructuredTaskProposalBatchResult
}

export type PortableConversationProposalPreference = {
  enabled: boolean
  source: 'session' | 'workspace' | 'global' | 'default'
}

export type PortableConversationProposalNotice = {
  schemaVersion: 1
  noticeId: string
  proposalId: string
  source: PortableConversationSource
  branchIds: string[]
  content: string
  contentSha256: string
  delivery: AgentSessionBranchDelivery | null
  attemptId: string | null
  createdAt: number
  updatedAt: number
}

export type PortableConversationProposalNoticeBeginParams = {
  noticeId: string
  attemptId: string
}

export type PortableConversationProposalNoticeBeginResult = {
  notice: PortableConversationProposalNotice
  authorized: boolean
}

export type PortableConversationProposalNoticeCompleteParams = {
  noticeId: string
  attemptId: string
  status: 'accepted' | 'rejected' | 'unknown'
  reason?: string
}
