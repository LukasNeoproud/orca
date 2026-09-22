import type { AgentSessionBranchAnchor, AgentSessionBranchDelivery } from './agent-session-branch'
import type { StructuredAgentSessionCreateParams } from './structured-agent-session-create'
import type { AgentSessionMutationEnvelope } from './agent-session-wire'
import type { AgentSessionExecutionLocation } from './agent-session-record'

export type AgentSessionBranchProposalItem = {
  itemId: string
  branchId: string
  title: string
  scope: string
  dependencyIds: string[]
  workspaceId: string
  context: string
  verification: string
  uncertain: boolean
  sourceItemIds: string[]
  action:
    | { kind: 'prepare'; targetCreate: StructuredAgentSessionCreateParams }
    | { kind: 'attach'; targetSessionId: string }
}

export type AgentSessionBranchProposal = {
  schemaVersion: 1
  proposalId: string
  sourceSessionId: string
  sourceLocation?: AgentSessionExecutionLocation
  sourceAnchor: AgentSessionBranchAnchor
  revision: number
  state: 'offered' | 'dismissed' | 'confirmed'
  items: AgentSessionBranchProposalItem[]
  createdAt: number
  updatedAt: number
}

export type AgentSessionBranchProposalGetResult = {
  proposal: AgentSessionBranchProposal | null
}

export type AgentSessionBranchProposalPutParams = {
  proposal: AgentSessionBranchProposal
  expectedRevision: number
}

export type AgentSessionBranchSuggestionPreference = {
  enabled: boolean
  source: 'session' | 'workspace' | 'global' | 'default'
}

export type AgentSessionBranchSuggestionPreferenceSetParams = {
  sessionId: string
  scope: 'session' | 'workspace' | 'global'
  enabled: boolean
}

export type AgentSessionBranchNotice = {
  schemaVersion: 1
  noticeId: string
  sourceSessionId: string
  branchIds: string[]
  content: string
  contentSha256: string
  delivery: AgentSessionBranchDelivery | null
  createdAt: number
  updatedAt: number
}

export type AgentSessionBranchNoticePrepareParams = {
  noticeId: string
  sourceSessionId: string
  branchIds: string[]
  content: string
}

export type AgentSessionBranchNoticeSendParams = {
  noticeId: string
  envelope: AgentSessionMutationEnvelope
  retryUnknown?: true
}
