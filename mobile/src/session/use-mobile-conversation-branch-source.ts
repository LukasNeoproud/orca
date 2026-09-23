import { useMemo } from 'react'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../src/shared/agent-session-journal-types'
import { projectStructuredAgentSessionMessages } from '../../../src/shared/structured-agent-session-message-projection'
import { mobileConversationBranchableItemIds } from './mobile-conversation-branch-model'

export function useMobileConversationBranchSource(
  items: readonly AgentJournalRenderItem[],
  submissions: readonly AgentJournalSubmission[]
) {
  return useMemo(
    () => ({
      messages: projectStructuredAgentSessionMessages(items, [], submissions),
      branchableMessageIds: mobileConversationBranchableItemIds(items)
    }),
    [items, submissions]
  )
}
