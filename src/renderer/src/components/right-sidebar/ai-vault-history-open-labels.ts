import { translate } from '@/i18n/i18n'
import type { AiVaultResumeInChatBlockedReason } from './ai-vault-session-resume-in-chat'

export function aiVaultChatOpenBlockedMessage(reason?: AiVaultResumeInChatBlockedReason): string {
  if (reason === 'agent') {
    return translate(
      'auto.components.sidebar.WorktreeConversationHistory.structuredAgentUnsupported',
      'This agent does not support structured chat.'
    )
  }
  if (reason === 'remote') {
    return translate(
      'auto.components.sidebar.WorktreeConversationHistory.structuredLocalOnly',
      'Structured chat is available for local sessions only.'
    )
  }
  if (reason === 'empty') {
    return translate(
      'auto.components.sidebar.WorktreeConversationHistory.emptySessionUnsupported',
      'This session has no saved conversation to open.'
    )
  }
  if (reason === 'already-structured') {
    return translate(
      'auto.components.sidebar.WorktreeConversationHistory.alreadyOpen',
      'This conversation is already open.'
    )
  }
  return translate(
    'auto.components.sidebar.WorktreeConversationHistory.structuredWorkspaceUnsupported',
    'Structured chat is unavailable in this workspace.'
  )
}
