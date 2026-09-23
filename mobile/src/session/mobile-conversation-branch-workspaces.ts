import type { Worktree } from '../worktree/workspace-list-types'
import type { MobileConversationBranchWorkspace } from './mobile-conversation-branch-model'
import { getWorktreeLabel } from './worktree-label'

export function mobileConversationBranchWorkspaces(
  rows: readonly Worktree[],
  sourceWorkspaceId: string
): MobileConversationBranchWorkspace[] {
  const workspaces = rows.map((row): MobileConversationBranchWorkspace => ({
    id: row.worktreeId,
    label: getWorktreeLabel(row.displayName, row.worktreeId),
    kind: row.workspaceKind === 'folder-workspace' ? 'folder' : 'git-worktree'
  }))
  if (!workspaces.some((workspace) => workspace.id === sourceWorkspaceId)) {
    workspaces.unshift({
      id: sourceWorkspaceId,
      label: getWorktreeLabel(undefined, sourceWorkspaceId),
      kind: sourceWorkspaceId.startsWith('folder:') ? 'folder' : 'git-worktree'
    })
  }
  return workspaces
}
