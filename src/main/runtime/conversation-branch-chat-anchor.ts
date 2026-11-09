// Which Claude turn a chat row belongs to. The row id a client sends is a journal id; the fork
// needs the transcript uuid of the prompt that opened that row's turn. Turns come from the same
// projection the transcript draws, so the turn a client sees is the turn that is forked.

import type { AgentJournalSnapshot } from '../../shared/agent-session-journal-types'
import {
  agentJournalSubmissionKey,
  parseAgentJournalItemKey
} from '../../shared/agent-session-journal-item-key'
import { nativeChatTurnMembership } from '../../shared/native-chat-turn-membership'
import { projectNativeChatTranscriptMessages } from '../../shared/native-chat-transcript-projection'
import { projectStructuredAgentSessionMessages } from '../../shared/structured-agent-session-message-projection'

export type ConversationBranchChatAnchor = {
  /** The Claude session the turn ran in; after a /clear it is not the chat's current one. */
  providerSessionId: string
  promptUuid: string
  turnItemId: string
}

export function resolveConversationBranchChatAnchor(
  snapshot: Pick<AgentJournalSnapshot, 'items' | 'submissions'>,
  itemId: string
): ConversationBranchChatAnchor {
  const { items, submissions } = snapshot
  const transcript = projectNativeChatTranscriptMessages(
    projectStructuredAgentSessionMessages(items, [], submissions, { rejectedInPlace: false })
  )
  const { turnKeys } = nativeChatTurnMembership(transcript, { items, submissions })
  const index = transcript.findIndex((message) => message.id === itemId)
  const turnItemId = index === -1 ? undefined : turnKeys[index]
  if (!turnItemId) {
    throw new Error('conversation_branch_invalid_anchor')
  }
  // A prompt Orca sent is journaled under its own id; the uuid Claude filed it under rides along.
  const sent = submissions.find(
    (submission) =>
      submission.dispatchState === 'accepted' &&
      agentJournalSubmissionKey(submission.clientMessageId) === turnItemId
  )
  const key = parseAgentJournalItemKey(sent?.providerItemId ?? turnItemId)
  if (key?.provider !== 'claude') {
    throw new Error('conversation_branch_invalid_anchor')
  }
  return { providerSessionId: key.sessionId, promptUuid: key.uuid, turnItemId }
}
