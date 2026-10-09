import { useCallback, useEffect, useRef, useState } from 'react'
import { getAzureDevOpsReviewDetail } from '@/lib/azure-devops-review-client'
import { useAzureDevOpsReviewStore } from '@/store/azure-devops-review-store'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'

export type AzureDevOpsReviewDetailState = {
  detail: AzureDevOpsReviewDetail | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useAzureDevOpsReviewDetail(pullRequestKey: string): AzureDevOpsReviewDetailState {
  const [detail, setDetail] = useState<AzureDevOpsReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const reload = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await getAzureDevOpsReviewDetail(pullRequestKey)
      if (current === generation.current) {
        setDetail(next)
        if (next.reviewWorktree) {
          useAzureDevOpsReviewChatLinks
            .getState()
            .setWorktreePullRequest(
              next.reviewWorktree.worktreeId,
              next.reviewWorktree.pullRequestKey
            )
        }
        // Why: keep the sidebar's draft badge in step without refetching every PR.
        const store = useAzureDevOpsReviewStore.getState()
        if (store.list) {
          const unpublished = next.drafts.filter((draft) => draft.state !== 'published').length
          useAzureDevOpsReviewStore.setState({
            list: {
              ...store.list,
              draftCounts: { ...store.list.draftCounts, [pullRequestKey]: unpublished }
            }
          })
        }
      }
    } catch (err) {
      if (current === generation.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (current === generation.current) {
        setLoading(false)
      }
    }
  }, [pullRequestKey])

  useEffect(() => {
    setDetail(null)
    void reload()
    return () => {
      generation.current += 1
    }
  }, [reload])

  return { detail, loading, error, reload }
}
