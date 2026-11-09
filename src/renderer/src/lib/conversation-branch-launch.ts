// Makes a branch and opens it as a chat holding the branch's prompt as an unsent draft. Nothing is
// sent: the person starts the branch when its turn comes, so branches never change files at once.
// The prompt goes into the chat's saved draft, not a launch draft: a launch draft is dropped once
// the transcript shows a user turn, which history a branch resumes from always has.

import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { beginStructuredAgentSessionProvisionalLaunch } from '@/lib/structured-agent-session-provisional-tab'
import type { StructuredAgentLaunchSettlement } from '@/lib/structured-agent-launch-settlement'
import {
  prepareConversationBranch,
  type ConversationBranchPrepareRequest
} from '@/runtime/conversation-branch-client'
import { refreshConversationBranches } from '@/components/conversation-branch/use-conversation-branches'
import { appendNativeChatDraftCache } from '@/components/native-chat/native-chat-draft-cache'
import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/native-chat-composer-draft-store'
import { useAppStore } from '@/store'
import type { ConversationBranchRecord } from '../../../shared/conversation-branch'
import { structuredAgentSessionTabId } from '../../../shared/structured-agent-session-projection'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/** Opens a Claude chat on `providerSessionId` (a fresh one when null) with `prompt` unsent. */
function openBranchChat(args: {
  worktreeId: string
  providerSessionId: string | null
  prompt: string
  label: string
}): Promise<string> {
  const plan = adoptAgentSessionLaunchVerdict({
    route: 'structured-native-chat',
    requestId: newAgentLaunchRequestId(),
    agent: 'claude',
    worktreeId: args.worktreeId,
    ...(args.providerSessionId ? { resumeFrom: { providerSessionId: args.providerSessionId } } : {})
  })
  const launch = beginStructuredAgentSessionProvisionalLaunch({ plan, hooks: {} })
  if (!launch) {
    return Promise.reject(new Error('conversation_branch_unavailable'))
  }
  // A local chat's id is known now, so the draft is there when its composer mounts.
  const draftedFor = launch.sessionId
  if (draftedFor) {
    appendNativeChatDraftCache(structuredAgentSessionDraftScopeKey(draftedFor), args.prompt)
  }
  return launch.settlement.then((settlement: StructuredAgentLaunchSettlement) => {
    if (settlement.kind === 'structured' || settlement.kind === 'visibility-unknown') {
      // Two branches of one review would otherwise both read "Claude Chat".
      useAppStore
        .getState()
        .setTabCustomTitle(structuredAgentSessionTabId(settlement.sessionId), args.label, {
          recordInteraction: false
        })
      if (settlement.sessionId !== draftedFor) {
        appendNativeChatDraftCache(
          structuredAgentSessionDraftScopeKey(settlement.sessionId),
          args.prompt
        )
      }
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
        prompt,
        label: request.label
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
      prompt,
      label: request.label
    })
    return branch
  } finally {
    void refreshConversationBranches(target, request.worktreeId)
  }
}
