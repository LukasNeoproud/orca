import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { NativeChatBranchBreadcrumb } from './NativeChatBranchBreadcrumb'
import { NativeChatResumeInCliButton } from './NativeChatResumeInCliButton'
import { NativeChatSidePanelToggle } from './NativeChatSidePanelToggle'
import { useNativeChatTabOwnerWorktreeId } from './use-native-chat-tab-owner'

/** The chat's top edge: the resume-in-terminal corner action and, in a branch, its breadcrumb. */
export function NativeChatSessionTopBar({
  findOpen,
  ...session
}: {
  tabId: string
  sessionId: string
  agent: AgentType
  target: RuntimeClientTarget
  /** The find bar holds the corner while open. */
  findOpen: boolean
}): React.JSX.Element {
  const ownerWorktreeId = useNativeChatTabOwnerWorktreeId(session.tabId)
  return (
    <>
      <NativeChatResumeInCliButton {...session} worktreeId={findOpen ? null : ownerWorktreeId} />
      {findOpen ? null : <NativeChatSidePanelToggle />}
      <NativeChatBranchBreadcrumb session={session} worktreeId={ownerWorktreeId} />
    </>
  )
}
