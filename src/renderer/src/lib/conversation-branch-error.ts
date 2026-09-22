import { translate } from '@/i18n/i18n'

export function conversationBranchError(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : String(failure)
  const code = message
    .match(/\b(?:agent_session_branch|portable_conversation)_[a-z_]+\b/)?.[0]
    ?.replace(/^portable_conversation_branch_/, 'agent_session_branch_')
  if (code === undefined) {
    return message
  }
  switch (code) {
    case 'agent_session_branch_source_busy':
      return translate(
        'conversations.errors.sourceBusy',
        'The source conversation is still working. Wait for the turn to finish, then try again.'
      )
    case 'portable_conversation_workspace_changed':
    case 'portable_conversation_topic_index_source_changed':
    case 'portable_conversation_topic_index_anchor_invalid':
    case 'agent_session_branch_source_stale':
    case 'agent_session_branch_preview_stale':
    case 'agent_session_branch_invalid_anchor':
      return translate(
        'conversations.errors.sourceChanged',
        'The source history changed. Reopen the response and review the context again.'
      )
    case 'portable_conversation_proposal_missing':
    case 'portable_conversation_proposal_notice_missing':
    case 'portable_conversation_project_unavailable':
    case 'agent_session_branch_result_missing':
    case 'agent_session_branch_source_missing':
    case 'agent_session_branch_target_missing':
    case 'agent_session_branch_missing':
      return translate(
        'conversations.errors.missing',
        'The linked conversation is unavailable. Reconnect its host or choose another conversation.'
      )
    case 'portable_conversation_execution_owner_mismatch':
    case 'portable_conversation_workspace_mismatch':
    case 'portable_conversation_requires_ssh_owner':
    case 'agent_session_branch_execution_owner_mismatch':
    case 'agent_session_branch_target_mismatch':
      return translate(
        'conversations.errors.ownerMismatch',
        'The selected conversation belongs to a different execution host or workspace. Choose a target on the source host.'
      )
    case 'agent_session_branch_provider_unsupported':
    case 'agent_session_branch_source_identity_missing':
      return translate(
        'conversations.errors.forkUnsupported',
        'Historical branching is unavailable for this provider session. Use a targeted handoff or update the owning runtime and agent.'
      )
    case 'agent_session_branch_history_truncated':
    case 'agent_session_branch_history_limit':
      return translate(
        'conversations.errors.historyLimit',
        'This history exceeds the context preview limit. Select a shorter passage and prepare a targeted handoff.'
      )
    case 'agent_session_branch_content_limit':
      return translate(
        'conversations.errors.contentLimit',
        'The handoff is empty or too large. Edit it to a shorter, focused instruction.'
      )
    case 'portable_conversation_proposal_immutable':
    case 'portable_conversation_proposal_intent_mismatch':
    case 'portable_conversation_proposal_notice_attempt_mismatch':
    case 'agent_session_branch_attempt_mismatch':
    case 'agent_session_branch_operation_conflict':
      return translate(
        'conversations.errors.operationConflict',
        'This attempt already has a saved payload. Refresh the related conversations and recover that attempt before starting another.'
      )
    case 'portable_conversation_topic_index_stale':
    case 'portable_conversation_proposal_stale':
    case 'agent_session_branch_proposal_stale':
      return translate(
        'conversations.errors.proposalStale',
        'The saved proposal changed. Refresh it before confirming your edits.'
      )
    case 'agent_session_branch_notice_scope_invalid':
      return translate(
        'conversations.errors.noticeScope',
        'The related conversations changed. Refresh them before sending the scope update.'
      )
    case 'portable_conversation_proposal_notice_already_sent':
    case 'agent_session_branch_already_started':
    case 'agent_session_branch_result_already_sent':
    case 'agent_session_branch_notice_already_sent':
      return translate(
        'conversations.errors.alreadySent',
        'This handoff has already been sent. Refresh the conversation to see its recorded delivery.'
      )
    case 'agent_session_branch_cycle':
      return translate(
        'conversations.errors.cycle',
        'That link would make the conversation its own ancestor. Choose another related conversation.'
      )
    case 'portable_conversation_topic_index_unsupported':
    case 'agent_session_branch_unsupported':
      return translate(
        'conversations.errors.update',
        'Update the owning Orca runtime to use related conversations.'
      )
    case 'portable_conversation_proposal_notice_in_flight':
    case 'agent_session_branch_delivery_in_flight':
      return translate(
        'conversations.errors.deliveryInFlight',
        'An earlier delivery attempt is pending or unverified. Reopen the saved handoff to inspect it; it will not be sent again automatically.'
      )
    default:
      return message
  }
}
