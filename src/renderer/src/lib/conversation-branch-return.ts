// A branch hands its result back: into the parent chat's composer as a draft, never sent, so the
// person decides what the parent does with it. The host keeps a copy with the branch record.

import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { openBranchChat } from '@/lib/conversation-branch-launch'
import { openConversationBranchMember } from '@/lib/conversation-branch-members'
import { recordConversationBranchReturn } from '@/runtime/conversation-branch-client'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { refreshConversationBranches } from '@/components/conversation-branch/use-conversation-branches'
import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/native-chat-composer-draft-store'
import { appendNativeChatDraftCache } from '@/components/native-chat/native-chat-draft-cache'
import { conversationBranchChat } from '../../../shared/conversation-branch-relatives'
import type { ConversationBranchRecord } from '../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

export function conversationBranchReturnDraft(label: string, reply: string): string {
  return `Result of the branch "${label}":\n\n${reply.trim()}`
}

export async function returnConversationBranchResult(args: {
  target: RuntimeClientTarget
  worktreeId: string
  branch: ConversationBranchRecord
  content: string
}): Promise<void> {
  const parentId = args.branch.parent.providerSessionId
  const snapshot = getStructuredAgentSessionStatusFeed(args.target).getSnapshot()
  const parentChat = conversationBranchChat(snapshot, parentId)
  if (parentChat) {
    appendNativeChatDraftCache(
      structuredAgentSessionDraftScopeKey(parentChat.sessionId),
      args.content
    )
    await openConversationBranchMember({
      target: args.target,
      worktreeId: args.worktreeId,
      providerSessionId: parentId
    })
  } else {
    await openBranchChat({
      worktreeId: args.worktreeId,
      providerSessionId: parentId,
      prompt: args.content
    })
  }
  // The draft is the hand-back; the record is history, so failing to keep it does not undo it.
  try {
    await recordConversationBranchReturn(args.target, {
      branchId: args.branch.branchId,
      returnId: newAgentLaunchRequestId(),
      content: args.content
    })
    void refreshConversationBranches(args.target, args.worktreeId)
  } catch {
    toast.warning(
      translate(
        'conversationBranch.returnNotRecorded',
        'The result is in the parent’s composer, but the host did not keep a copy with the branch.'
      )
    )
  }
}
