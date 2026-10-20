import {
  setWorktreeNavActivator,
  setWorktreeNavViewActivator
} from '@/store/slices/worktree-nav-history'
import type { WorktreeNavHistoryViewEntry } from '@/store/slices/worktree-nav-history'
import { useAppStore } from '@/store'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'

type ActivateFn = (worktreeId: string, opts: { navigationIntent: 'user-open' }) => unknown
type ViewActivateFn = (entry: WorktreeNavHistoryViewEntry) => void

export function registerWorktreeActivation(
  activate: ActivateFn,
  activateView: ViewActivateFn
): void {
  // Why: back/forward is the user reopening a workspace they chose, like a sidebar click.
  setWorktreeNavActivator((worktreeId) => {
    const result = activate(worktreeId, { navigationIntent: 'user-open' })
    // Why: returning to the workspace under an open pull request page changes no workspace state the page closes on.
    if (result !== false) {
      closeAzureDevOpsPullRequestPage()
    }
    return result
  })
  setWorktreeNavViewActivator((entry) => {
    // Why: the page overlays the workspace it was opened from, so bring that workspace back first.
    if (
      typeof entry === 'object' &&
      entry.kind === 'azure-devops-pull-request' &&
      entry.worktreeId &&
      entry.worktreeId !== useAppStore.getState().activeWorktreeId
    ) {
      activate(entry.worktreeId, { navigationIntent: 'user-open' })
    }
    activateView(entry)
  })
}
