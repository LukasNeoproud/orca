import { translate } from '@/i18n/i18n'
import { conversationBranchErrorCode } from '../../../../shared/conversation-branch'

/** What a failed branch tells the person; an unknown failure keeps the provider's own words. */
export function conversationBranchErrorText(error: unknown): string {
  switch (conversationBranchErrorCode(error)) {
    case 'conversation_branch_source_busy':
      return translate(
        'conversationBranch.errorBusy',
        'Wait for the agent to finish before branching from this chat.'
      )
    case 'conversation_branch_invalid_anchor':
      return translate(
        'conversationBranch.errorAnchor',
        'This reply cannot be a branch point. Branch from a reply that ended its turn.'
      )
    case 'conversation_branch_history_missing':
      return translate(
        'conversationBranch.errorHistory',
        'Claude’s saved conversation was not found on the host.'
      )
    case 'conversation_branch_workspace_mismatch':
      return translate(
        'conversationBranch.errorWorkspace',
        'This chat belongs to another workspace.'
      )
    case 'conversation_branch_fork_unverified':
      return translate(
        'conversationBranch.errorUnverified',
        'Orca could not confirm that the branch was created. It is listed among the branches; it will not be created again.'
      )
    case 'conversation_branch_unavailable':
      return translate(
        'conversationBranch.errorUnavailable',
        'Branching is not available on this host. Update Orca on the host, and make sure Chat UI is on.'
      )
    case 'conversation_branch_not_found':
    case null:
      return error instanceof Error && error.message
        ? error.message
        : translate('conversationBranch.errorGeneric', 'The branch could not be created.')
  }
}
