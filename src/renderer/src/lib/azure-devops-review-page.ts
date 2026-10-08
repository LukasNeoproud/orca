import { useAppStore } from '@/store'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import { closeIndependentTerminalsView } from './independent-terminals-view'

/** Shows a pull request on the workbench page, over the active workspace. */
export function openAzureDevOpsPullRequestPage(pullRequestKey: string): void {
  closeIndependentTerminalsView()
  const app = useAppStore.getState()
  if (app.activeView !== 'terminal') {
    app.setActiveView('terminal')
  }
  useAzureDevOpsReviewStore.getState().openPullRequest(pullRequestKey)
}

export function closeAzureDevOpsPullRequestPage(): void {
  if (useAzureDevOpsReviewStore.getState().openPullRequestKey !== null) {
    useAzureDevOpsReviewStore.getState().closePullRequest()
  }
}
