import { createContext, useContext } from 'react'
import type { AgentJournalSubmission } from '../../../../../shared/agent-session-journal-types'
import {
  agentJournalSubmissionKey,
  parseAgentJournalItemKey
} from '../../../../../shared/agent-session-journal-item-key'

/** Claude's user-message uuid by the transcript row id of the prompt Orca sent. */
export type ClaudeModsUserMessageIds = ReadonlyMap<string, string>

const NO_IDS: ClaudeModsUserMessageIds = new Map()

export const ClaudeModsUserMessageIdsContext = createContext<ClaudeModsUserMessageIds>(NO_IDS)

/** The uuid the CLI named each accepted prompt by, once its dispatch adopted a provider id. */
export function claudeModsUserMessageIds(
  submissions: readonly AgentJournalSubmission[]
): ClaudeModsUserMessageIds {
  const ids = new Map<string, string>()
  for (const submission of submissions) {
    const identity = submission.providerItemId
      ? parseAgentJournalItemKey(submission.providerItemId)
      : null
    if (identity?.provider === 'claude') {
      ids.set(agentJournalSubmissionKey(submission.clientMessageId), identity.uuid)
    }
  }
  return ids
}

/** The id a user row's `UserMessage` site is asked under: Claude's uuid, else the row's own. */
export function useClaudeModsUserMessageId(rowId: string): string {
  return useContext(ClaudeModsUserMessageIdsContext).get(rowId) ?? rowId
}

/** The AskUserQuestion `tool_use_id` a pending question item carries, when its host sends one. */
export function claudeModsQuestionToolUseId(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) {
    return undefined
  }
  const id: unknown = Reflect.get(item, 'toolUseId')
  return typeof id === 'string' && id.length > 0 ? id : undefined
}
