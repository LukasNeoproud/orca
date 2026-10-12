import type { MobileWorkspaceRepo, NewWorktreeModalProps } from './new-worktree-modal-types'

export type NewWorktreeParentItem = { id: string; label: string; detail?: string }

/** Parent candidates are live worktrees of the selected repo on the same execution host. */
export function newWorktreeParentItems(
  existingWorktrees: NewWorktreeModalProps['existingWorktrees'],
  selectedRepo: MobileWorkspaceRepo | null
): NewWorktreeParentItem[] {
  return [
    { id: '__none__', label: 'No parent' },
    ...(existingWorktrees ?? [])
      .filter(
        (worktree) =>
          worktree.worktreeId &&
          worktree.repoId === selectedRepo?.id &&
          !worktree.isArchived &&
          (!selectedRepo?.executionHostId ||
            !worktree.hostId ||
            worktree.hostId === selectedRepo.executionHostId)
      )
      .map((worktree) => ({
        id: worktree.worktreeId!,
        label: worktree.displayName || worktree.branch,
        detail: worktree.branch
      }))
  ]
}
