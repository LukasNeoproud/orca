// Finding and opening the chats of a conversation family, which are known by Claude session id:
// the id a branch record names whether the chat is open, closed or never opened here.

import { activateStructuredAgentSessionById } from '@/lib/structured-agent-session-tab-activation'
import { revealStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { openBranchChat } from '@/lib/conversation-branch-launch'
import { requestNativeChatRailJump } from '@/components/native-chat/native-chat-requested-rail-jump'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { conversationBranchChat } from '../../../shared/conversation-branch-relatives'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/** Shows a family member: its chat when the host has one, else a new chat resuming it. */
export async function openConversationBranchMember(args: {
  target: RuntimeClientTarget
  worktreeId: string
  providerSessionId: string
  /** A prompt to scroll to once the chat lists it: the turn a branch started after. */
  jumpToItemId?: string
}): Promise<void> {
  if (args.jumpToItemId) {
    requestNativeChatRailJump(args.jumpToItemId)
  }
  const snapshot = getStructuredAgentSessionStatusFeed(args.target).getSnapshot()
  const chat = conversationBranchChat(snapshot, args.providerSessionId)
  if (!chat) {
    await openBranchChat({
      worktreeId: args.worktreeId,
      providerSessionId: args.providerSessionId,
      prompt: ''
    })
    return
  }
  const location = { worktreeId: chat.workspaceId, sessionId: chat.sessionId, target: args.target }
  if (!activateStructuredAgentSessionById(location)) {
    await revealStructuredSession(location)
  }
}
