import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { callConversationRuntimeFeature } from './conversation-runtime-rpc'
import { AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type {
  AgentSessionBranchAttachParams,
  AgentSessionBranchPrepareParams,
  AgentSessionBranchPrepareResult,
  AgentSessionBranchPreviewParams,
  AgentSessionBranchPreviewResult,
  AgentSessionBranchesResult
} from '../../../shared/agent-session-branch'
import type {
  AgentSessionBranchNotice,
  AgentSessionBranchNoticePrepareParams,
  AgentSessionBranchNoticeSendParams,
  AgentSessionBranchProposal,
  AgentSessionBranchProposalGetResult,
  AgentSessionBranchProposalPutParams,
  AgentSessionBranchSuggestionPreference,
  AgentSessionBranchSuggestionPreferenceSetParams
} from '../../../shared/agent-session-branch-proposal'

export async function callConversationBranch<T>(
  target: RuntimeClientTarget,
  method: string,
  params: unknown
): Promise<T> {
  return callConversationRuntimeFeature<T>(
    target,
    AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY,
    'Update the owning Orca runtime to use related conversations.',
    method,
    params
  )
}

export const previewConversationBranch = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchPreviewParams
) =>
  callConversationBranch<AgentSessionBranchPreviewResult>(
    target,
    'agentSession.branchPreview',
    params
  )

export const prepareConversationBranch = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchPrepareParams
) =>
  callConversationBranch<AgentSessionBranchPrepareResult>(
    target,
    'agentSession.branchPrepare',
    params
  )

export const attachConversationBranch = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchAttachParams
) =>
  callConversationBranch<AgentSessionBranchPrepareResult>(
    target,
    'agentSession.branchAttach',
    params
  )

export const readConversationFamily = (target: RuntimeClientTarget, sessionId: string) =>
  callConversationBranch<AgentSessionBranchesResult>(target, 'agentSession.branches', { sessionId })

export const readConversationBranchProposal = (target: RuntimeClientTarget, sessionId: string) =>
  callConversationBranch<AgentSessionBranchProposalGetResult>(
    target,
    'agentSession.branchProposalGet',
    { sessionId }
  )

export const writeConversationBranchProposal = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchProposalPutParams
) =>
  callConversationBranch<{ proposal: AgentSessionBranchProposal }>(
    target,
    'agentSession.branchProposalPut',
    params
  )

export const readConversationBranchSuggestionPreference = (
  target: RuntimeClientTarget,
  sessionId: string
) =>
  callConversationBranch<AgentSessionBranchSuggestionPreference>(
    target,
    'agentSession.branchSuggestionPreferenceGet',
    { sessionId }
  )

export const writeConversationBranchSuggestionPreference = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchSuggestionPreferenceSetParams
) =>
  callConversationBranch<AgentSessionBranchSuggestionPreference>(
    target,
    'agentSession.branchSuggestionPreferenceSet',
    params
  )

export const prepareConversationBranchNotice = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchNoticePrepareParams
) =>
  callConversationBranch<{ notice: AgentSessionBranchNotice }>(
    target,
    'agentSession.branchNoticePrepare',
    params
  )

export const sendConversationBranchNotice = (
  target: RuntimeClientTarget,
  params: AgentSessionBranchNoticeSendParams
) =>
  callConversationBranch<{ notice: AgentSessionBranchNotice }>(
    target,
    'agentSession.branchNoticeSend',
    params
  )

export const readConversationBranchNotices = (target: RuntimeClientTarget, sessionId: string) =>
  callConversationBranch<{ notices: AgentSessionBranchNotice[] }>(
    target,
    'agentSession.branchNotices',
    { sessionId }
  )
