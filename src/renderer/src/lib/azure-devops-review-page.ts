import { useAppStore } from '@/store'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import type { WorktreeNavHistoryPullRequestEntry } from '@/store/slices/worktree-nav-history'
import { closeIndependentTerminalsView } from './independent-terminals-view'

/** Shows a pull request on the workbench page, over the active workspace. */
export function openAzureDevOpsPullRequestPage(pullRequestKey: string): void {
  showAzureDevOpsPullRequestPage(pullRequestKey)
  const app = useAppStore.getState()
  if (!app.isNavigatingHistory) {
    app.recordViewVisit({
      kind: 'azure-devops-pull-request',
      pullRequestKey,
      worktreeId: app.activeWorktreeId
    })
  }
}

/** Back/Forward replay: shows the page without recording a new visit. */
export function replayAzureDevOpsPullRequestPage(entry: WorktreeNavHistoryPullRequestEntry): void {
  showAzureDevOpsPullRequestPage(entry.pullRequestKey)
}

function showAzureDevOpsPullRequestPage(pullRequestKey: string): void {
  closeIndependentTerminalsView()
  const app = useAppStore.getState()
  if (app.activeView !== 'terminal') {
    app.setActiveView('terminal')
  }
  useAzureDevOpsReviewStore.getState().openPullRequest(pullRequestKey)
  useAzureDevOpsAutoReview.getState().markOpened(pullRequestKey)
}

export function closeAzureDevOpsPullRequestPage(): void {
  if (useAzureDevOpsReviewStore.getState().openPullRequestKey === null) {
    return
  }
  useAzureDevOpsReviewStore.getState().closePullRequest()
  const app = useAppStore.getState()
  const current = app.worktreeNavHistory[app.worktreeNavHistoryIndex]
  // Why: leaving the page for the workspace beneath it (close, its chat tab) is a visit Back must undo.
  if (
    !app.isNavigatingHistory &&
    app.activeView === 'terminal' &&
    app.activeWorktreeId &&
    typeof current === 'object' &&
    current.kind === 'azure-devops-pull-request'
  ) {
    app.recordWorktreeVisit(app.activeWorktreeId)
  }
}
