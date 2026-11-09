// Makes a branch and opens it as a chat holding the branch's prompt as an unsent draft. Nothing is
// sent: the person starts the branch when its turn comes, so branches never change files at once.

import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { beginStructuredAgentSessionProvisionalLaunch } from '@/lib/structured-agent-session-provisional-tab'
import type { StructuredAgentLaunchSettlement } from '@/lib/structured-agent-launch-settlement'
import {
  prepareConversationBranch,
  type ConversationBranchPrepareRequest
} from '@/runtime/conversation-branch-client'
import { refreshConversationBranches } from '@/components/conversation-branch/use-conversation-branches'
import type { ConversationBranchRecord } from '../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/** Opens a Claude chat on `providerSessionId` (a fresh one when null) with `prompt` unsent. */
function openBranchChat(args: {
  worktreeId: string
  providerSessionId: string | null
  prompt: string
}): Promise<string> {
  const plan = adoptAgentSessionLaunchVerdict({
    route: 'structured-native-chat',
    requestId: newAgentLaunchRequestId(),
    agent: 'claude',
    worktreeId: args.worktreeId,
    ...(args.providerSessionId
      ? { resumeFrom: { providerSessionId: args.providerSessionId } }
      : {}),
    ...(args.prompt.trim() ? { prompt: args.prompt, promptDelivery: 'draft' as const } : {})
  })
  const launch = beginStructuredAgentSessionProvisionalLaunch({ plan, hooks: {} })
  if (!launch) {
    return Promise.reject(new Error('conversation_branch_unavailable'))
  }
  return launch.settlement.then((settlement: StructuredAgentLaunchSettlement) => {
    if (settlement.kind === 'structured' || settlement.kind === 'visibility-unknown') {
      return settlement.sessionId
    }
    throw settlement.kind === 'failed'
      ? settlement.error
      : new Error('conversation_branch_cancelled')
  })
}

export type ConversationBranchChatRequest = Omit<
  ConversationBranchPrepareRequest,
  'surface' | 'childStructuredSessionId'
> & { prompt: string }

/** Prepares the branch on the host, then opens it. A clean branch is a new chat the host links. */
export async function startConversationBranchInChat(
  target: RuntimeClientTarget,
  request: ConversationBranchChatRequest
): Promise<ConversationBranchRecord> {
  const { prompt, ...prepare } = request
  try {
    if (request.mode === 'clean') {
      const sessionId = await openBranchChat({
        worktreeId: request.worktreeId,
        providerSessionId: null,
        prompt
      })
      return await prepareConversationBranch(target, {
        ...prepare,
        surface: 'chat',
        childStructuredSessionId: sessionId
      })
    }
    const branch = await prepareConversationBranch(target, { ...prepare, surface: 'chat' })
    await openBranchChat({
      worktreeId: request.worktreeId,
      providerSessionId: branch.child.providerSessionId,
      prompt
    })
    return branch
  } finally {
    void refreshConversationBranches(target, request.worktreeId)
  }
}
