import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { WorkspaceConversationRoute } from '@/lib/workspace-conversation-activation'
import type { AgentSessionHandleProvider } from '../../../../shared/agent-session-provider-handle'

export type ConversationBranchSelection = {
  sourceSessionId: string
  epoch: string
  itemId: string
  text: string
  selectedText?: string
  agent: AgentSessionHandleProvider
  target: RuntimeClientTarget
  route: WorkspaceConversationRoute
}

export function targetedConversationHandoff(
  selection: Pick<ConversationBranchSelection, 'text' | 'selectedText'>
): string {
  const passage = selection.selectedText?.trim() || selection.text
  return [
    '## Purpose and scope',
    'Address the selected passage as a separate, independently verifiable task. Keep unrelated work outside this thread.',
    '## Explicit requirements and constraints',
    'Follow the existing project instructions and permissions. Do not assume permission to change unrelated code.',
    '## Accepted decisions',
    'No additional accepted decisions have been supplied. Do not treat agent proposals as user-approved decisions.',
    '## Source passage — agent response, not independently verified',
    passage,
    '## References and open questions',
    'Verify claims and follow the references in the selected passage. Ask about unresolved requirements before making irreversible decisions.',
    '## Expected verification',
    'Report the outcome, relevant artifacts, checks actually performed, and remaining uncertainty.'
  ].join('\n\n')
}

export function conversationResultDraft(text: string): string {
  return [
    '## Conclusion',
    text,
    '## Decisions and artifacts',
    'List the decisions and relevant files or links.',
    '## Verification',
    'State which checks ran and their actual results; distinguish unverified claims.',
    '## Open points',
    'List unresolved questions and remaining work.',
    '## Integration',
    'This is an information handoff. No code has been merged and no task is marked complete by this message.'
  ].join('\n\n')
}
