// Finding and opening the members of a conversation family, which are known by Claude session id:
// the id a branch record names whether the member is open, closed or never opened here.

import { activateConversationBranchChatTab } from '@/lib/conversation-branch-host'
import { revealStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { openBranchChat } from '@/lib/conversation-branch-launch'
import { openConversationBranchTerminalMember } from '@/lib/conversation-branch-terminal-launch'
import { activateLiveProviderSessionPane } from '@/components/right-sidebar/ai-vault-running-pane-activation'
import { requestNativeChatRailJump } from '@/components/native-chat/native-chat-requested-rail-jump'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { conversationBranchChat } from '../../../shared/conversation-branch-relatives'
import type {
  ConversationBranchRecord,
  ConversationBranchSurface
} from '../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/** Where a member lives: a branch on the surface it was opened on, an original where it was
 *  branched from (only a chat source records its chat). */
export function conversationBranchMemberSurface(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): ConversationBranchSurface {
  const own = branches.find((branch) => branch.child.providerSessionId === providerSessionId)
  if (own) {
    return own.child.surface
  }
  const branchedFrom = branches.find(
    (branch) => branch.parent.providerSessionId === providerSessionId
  )
  return branchedFrom && !branchedFrom.parent.structuredSessionId ? 'terminal' : 'chat'
}

/** Shows a family member: its chat or running terminal when there is one, else reopens it on its
 *  own surface. */
export async function openConversationBranchMember(args: {
  target: RuntimeClientTarget
  worktreeId: string
  providerSessionId: string
  surface?: ConversationBranchSurface
  /** A prompt to scroll to once the chat lists it: the turn a branch started after. */
  jumpToItemId?: string
}): Promise<void> {
  const snapshot = getStructuredAgentSessionStatusFeed(args.target).getSnapshot()
  const chat = conversationBranchChat(snapshot, args.providerSessionId)
  if (chat) {
    if (args.jumpToItemId) {
      requestNativeChatRailJump(args.jumpToItemId)
    }
    const location = {
      worktreeId: chat.workspaceId,
      sessionId: chat.sessionId,
      target: args.target
    }
    if (!activateConversationBranchChatTab(location)) {
      await revealStructuredSession(location)
    }
    return
  }
  if (args.surface === 'terminal') {
    openConversationBranchTerminalMember(args)
    return
  }
  if (activateLiveProviderSessionPane('claude', args.providerSessionId)) {
    return
  }
  if (args.jumpToItemId) {
    requestNativeChatRailJump(args.jumpToItemId)
  }
  await openBranchChat({
    worktreeId: args.worktreeId,
    providerSessionId: args.providerSessionId,
    prompt: ''
  })
}
