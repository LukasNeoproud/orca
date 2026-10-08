import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import { useIndependentTerminalsViewOpen } from '@/lib/independent-terminals-view'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import { AzureDevOpsPullRequestPage } from './AzureDevOpsPullRequestPage'

type PageLayout = {
  activeView: string
  creationLayoutActive: boolean
}

export function useAzureDevOpsPullRequestPageVisible(layout: PageLayout): boolean {
  const open = useAzureDevOpsReviewStore((s) => s.openPullRequestKey !== null)
  return open && layout.activeView === 'terminal' && !layout.creationLayoutActive
}

/** Renders the open pull request in place of the workbench, like a workspace page. */
export function AzureDevOpsPullRequestPageHost({
  layout,
  reserveLeftHeaderSpace,
  reserveRightHeaderSpace
}: {
  layout: PageLayout
  reserveLeftHeaderSpace: boolean
  reserveRightHeaderSpace: boolean
}): React.JSX.Element | null {
  const pullRequestKey = useAzureDevOpsReviewStore((s) => s.openPullRequestKey)
  const visible = useAzureDevOpsPullRequestPageVisible(layout)
  const independentTerminalsOpen = useIndependentTerminalsViewOpen()

  useEffect(() => {
    if (independentTerminalsOpen) {
      closeAzureDevOpsPullRequestPage()
    }
  }, [independentTerminalsOpen])

  // Why: picking a workspace or another page is navigation away from the PR, like a workspace switch.
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (
          state.activeWorktreeId !== previous.activeWorktreeId ||
          state.activeView !== previous.activeView
        ) {
          closeAzureDevOpsPullRequestPage()
        }
      }),
    []
  )

  if (!visible || !pullRequestKey) {
    return null
  }
  return (
    <AzureDevOpsPullRequestPage
      key={pullRequestKey}
      pullRequestKey={pullRequestKey}
      reserveLeftHeaderSpace={reserveLeftHeaderSpace}
      reserveRightHeaderSpace={reserveRightHeaderSpace}
    />
  )
}
