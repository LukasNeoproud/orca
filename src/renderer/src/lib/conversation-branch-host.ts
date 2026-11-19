// Where a conversation family's Claude sessions live, decided from the workspace's and tabs' own
// rows. The Active Server names a host unrelated to the workspace, so it never picks one here.

import { resolveOwner } from '@/lib/resolve-owner'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { hostRouteForAuthority } from '@/runtime/runtime-client-target'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import type { WorktreeOperationRouteState } from '@/lib/worktree-operation-route'
import { useAppStore } from '@/store'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/** The runtime serving the workspace's conversations. Null for an SSH place, whose transcripts no
 *  runtime reads, an unknown owner or rows that disagree. */
export function conversationBranchWorkspaceTarget(
  state: WorktreeOperationRouteState,
  worktreeId: string
): RuntimeClientTarget | null {
  const owner = resolveOwner(state, { workspaceId: worktreeId })
  return owner.kind === 'resolved' && owner.owner.at === LOCAL_EXECUTION_HOST_ID
    ? hostRouteForAuthority(owner.owner).target
    : null
}

/** Shows the open tab of a family member's chat on `target`; false when none is open here. */
export function activateConversationBranchChatTab(location: {
  worktreeId: string
  sessionId: string
  target: RuntimeClientTarget
}): boolean {
  const state = useAppStore.getState()
  const host = executionHostIdForStructuredTarget(location.target)
  const workspaceTarget = conversationBranchWorkspaceTarget(state, location.worktreeId)
  // A tab from before launches stamped their host belongs to its workspace's owner.
  const unstampedHost = workspaceTarget ? executionHostIdForStructuredTarget(workspaceTarget) : null
  const tab = (state.unifiedTabsByWorktree[location.worktreeId] ?? []).find(
    (candidate) =>
      candidate.worktreeId === location.worktreeId &&
      candidate.contentType === 'agent-session' &&
      candidate.entityId === location.sessionId &&
      (candidate.executionHostId ?? unstampedHost) === host
  )
  return tab
    ? activateStructuredAgentSessionTab({
        worktreeId: location.worktreeId,
        tabId: tab.id,
        target: location.target
      })
    : false
}
