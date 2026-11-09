import { CONVERSATION_BRANCH_RUNTIME_CAPABILITY } from '../../../shared/structured-agent-session-surface-capabilities'
import type {
  ConversationBranchListResult,
  ConversationBranchMode,
  ConversationBranchOutline,
  ConversationBranchPrepareResult,
  ConversationBranchRecord,
  ConversationBranchSurface
} from '../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { callRuntimeRpc } from './runtime-rpc-client'
import { structuredAgentSessionHostSupports } from './structured-agent-session-client'

// A compacted branch runs Claude's compaction on the host before it answers.
const PREPARE_TIMEOUT_MS = 330_000

export type ConversationBranchSource =
  | { kind: 'chat'; sessionId: string; itemId: string }
  | { kind: 'transcript'; providerSessionId: string; promptUuid: string }

export type ConversationBranchPrepareRequest = {
  requestId: string
  worktreeId: string
  source: ConversationBranchSource
  mode: ConversationBranchMode
  surface: ConversationBranchSurface
  label: string
  focus?: string
  batchId?: string
  childStructuredSessionId?: string
}

/** Whether the host can branch at all; a host that predates it is never called. */
export function supportsConversationBranches(target: RuntimeClientTarget): Promise<boolean> {
  return structuredAgentSessionHostSupports(target, CONVERSATION_BRANCH_RUNTIME_CAPABILITY)
}

export async function listConversationBranches(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<ConversationBranchRecord[]> {
  if (!(await supportsConversationBranches(target))) {
    return []
  }
  const result = await callRuntimeRpc<ConversationBranchListResult>(
    target,
    'conversationBranch.list',
    { worktreeId }
  )
  return result.branches
}

export function readConversationBranchOutline(
  target: RuntimeClientTarget,
  worktreeId: string,
  providerSessionId: string
): Promise<ConversationBranchOutline> {
  return callRuntimeRpc<ConversationBranchOutline>(target, 'conversationBranch.outline', {
    worktreeId,
    providerSessionId
  })
}

export async function prepareConversationBranch(
  target: RuntimeClientTarget,
  request: ConversationBranchPrepareRequest
): Promise<ConversationBranchRecord> {
  const result = await callRuntimeRpc<ConversationBranchPrepareResult>(
    target,
    'conversationBranch.prepare',
    request,
    { timeoutMs: PREPARE_TIMEOUT_MS }
  )
  return result.branch
}

export async function recordConversationBranchReturn(
  target: RuntimeClientTarget,
  params: { branchId: string; returnId: string; content: string }
): Promise<ConversationBranchRecord> {
  const result = await callRuntimeRpc<ConversationBranchPrepareResult>(
    target,
    'conversationBranch.recordReturn',
    params
  )
  return result.branch
}
