import { useEffect, useState } from 'react'
import { azureDevOpsReviewHostCastsVotes } from '@/lib/azure-devops-review-client'
import type { AzureDevOpsReviewPullRequest } from '../../../../shared/azure-devops-review-types'
import { azureDevOpsReviewVoteObstacle } from '../../../../shared/azure-devops-review-vote'

/** Whether publishing may offer a vote: the pull request takes one and the host can cast it. */
export function useAzureDevOpsReviewVoteOffered(
  pullRequest: Pick<AzureDevOpsReviewPullRequest, 'status' | 'createdByMe'>
): boolean {
  // Why false until answered: a host that drops the vote must never be offered one.
  const [hostCastsVotes, setHostCastsVotes] = useState(false)
  useEffect(() => {
    let current = true
    void azureDevOpsReviewHostCastsVotes().then((supported) => {
      if (current) {
        setHostCastsVotes(supported)
      }
    })
    return () => {
      current = false
    }
  }, [])
  return hostCastsVotes && azureDevOpsReviewVoteObstacle(pullRequest) === null
}
