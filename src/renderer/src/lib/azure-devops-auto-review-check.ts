import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import { listAzureDevOpsReviewPullRequests } from './azure-devops-review-client'
import { azureDevOpsAutoReviewCandidates } from '../../../shared/azure-devops-auto-review'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

/** Offers whose notification is showing, so a PR that closed meanwhile can take its offer back. */
const offeredKeys = new Set<string>()

const offerToastId = (key: string): string => `azure-devops-auto-review:${key}`

/** A notification that stays until the user reviews or dismisses the pull request. */
export function offerAzureDevOpsReview(pullRequest: AzureDevOpsReviewPullRequest): void {
  const { key } = pullRequest
  offeredKeys.add(key)
  const dismiss = (): void => {
    offeredKeys.delete(key)
    useAzureDevOpsAutoReview.getState().markHandled([key])
  }
  toast(
    translate('azureDevOpsReview.autoReviewOffer', 'New pull request !{{value0}}', {
      value0: pullRequest.pullRequestId
    }),
    {
      id: offerToastId(key),
      duration: Number.POSITIVE_INFINITY,
      description: `${pullRequest.title} · ${pullRequest.repository} · ${pullRequest.author.displayName}`,
      action: {
        label: translate('azureDevOpsReview.autoReviewAccept', 'Review'),
        onClick: () => {
          offeredKeys.delete(key)
          useAzureDevOpsAutoReview.getState().chooseOptionsFor(pullRequest)
        }
      },
      // Why both: sonner's cancel button closes the toast without calling onDismiss.
      cancel: {
        label: translate('azureDevOpsReview.autoReviewDismiss', 'Dismiss'),
        onClick: dismiss
      },
      onDismiss: dismiss
    }
  )
}

let checking = false

/** Lists open pull requests and offers a review for each new one. */
export async function checkAzureDevOpsReviewOffers(): Promise<void> {
  if (checking) {
    return
  }
  checking = true
  try {
    const list = await listAzureDevOpsReviewPullRequests('active')
    const store = useAzureDevOpsAutoReview.getState()
    const listedKeys = new Set(list.pullRequests.map((pr) => pr.key))
    if (store.handledKeys === null) {
      // Why: the first check only learns what is already open, or every old PR would pop up.
      if (list.errors.length === 0) {
        store.markHandled([...listedKeys])
      }
      return
    }
    const candidates = azureDevOpsAutoReviewCandidates(list, store.handledKeys)
    const candidateKeys = new Set(candidates.map((pr) => pr.key))
    for (const key of offeredKeys) {
      const closed = !listedKeys.has(key) && list.errors.length === 0
      // Closed, voted on, drafted or turned into a draft PR elsewhere meanwhile.
      if (closed || (listedKeys.has(key) && !candidateKeys.has(key))) {
        toast.dismiss(offerToastId(key))
      }
    }
    for (const pullRequest of candidates) {
      if (!offeredKeys.has(pullRequest.key)) {
        offerAzureDevOpsReview(pullRequest)
      }
    }
    // Why only on a clean list: an unreachable org would otherwise forget its PRs and re-offer them.
    if (list.errors.length === 0) {
      store.retainHandled(listedKeys)
    }
  } catch {
    // The next check retries; a failing check must not nag the user.
  } finally {
    checking = false
  }
}
