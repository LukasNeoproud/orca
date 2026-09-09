import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from './worktree-activation'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { WORKTREE_ID_SEPARATOR } from '../../../shared/worktree/id'
import { translate } from '@/i18n/i18n'

export async function openRegisteredWorktree(
  repoId: string,
  path: string,
  executionHostId: ExecutionHostId
): Promise<void> {
  const refreshed = await useAppStore
    .getState()
    .fetchWorktrees(repoId, { executionHostId, requireAuthoritative: true })
  const state = useAppStore.getState()
  const worktree =
    refreshed &&
    state.getKnownWorktreeById(`${repoId}${WORKTREE_ID_SEPARATOR}${path}`, executionHostId)
  if (!worktree) {
    throw new Error(
      translate(
        'branchManagement.unavailableWorktree',
        'The registered worktree could not be loaded. Refresh and try again.'
      )
    )
  }
  activateAndRevealWorktree(worktree.id, {
    executionHostId,
    revealInSidebar: false,
    clearSidebarFilters: false
  })
}
