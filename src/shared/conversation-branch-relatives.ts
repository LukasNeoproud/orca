// A family's chats as the host's status feed reports them. Pure: desktop and phone read the same.

import type { AgentSessionStatusSummary } from './agent-session-wire'
import { conversationBranchOf, type ConversationBranchRecord } from './conversation-branch'
import {
  conversationBranchFamily,
  conversationBranchFamilyMembers
} from './conversation-branch-family'

export type ConversationBranchStatusSnapshot = ReadonlyMap<string, AgentSessionStatusSummary>

/** The host's chat holding `providerSessionId`, if it has one. */
export function conversationBranchChat(
  snapshot: ConversationBranchStatusSnapshot,
  providerSessionId: string
): AgentSessionStatusSummary | null {
  for (const summary of snapshot.values()) {
    if (summary.agent === 'claude' && summary.providerSession?.id === providerSessionId) {
      return summary
    }
  }
  return null
}

/** The other chats of the conversation's family working in the same workspace, with the branch
 *  name of each; null names the original conversation or one with no name. */
export function workingConversationBranchRelatives(
  snapshot: ConversationBranchStatusSnapshot,
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string,
  workspaceId: string
): { chat: AgentSessionStatusSummary; name: string | null }[] {
  const family = conversationBranchFamily(branches, providerSessionId)
  if (family.points.length === 0) {
    return []
  }
  return conversationBranchFamilyMembers(family).flatMap((memberId) => {
    if (memberId === providerSessionId) {
      return []
    }
    const chat = conversationBranchChat(snapshot, memberId)
    if (chat?.workspaceId !== workspaceId || chat.status !== 'working') {
      return []
    }
    return [
      {
        chat,
        name: conversationBranchOf(branches, memberId)?.label ?? chat.conversationName ?? null
      }
    ]
  })
}
