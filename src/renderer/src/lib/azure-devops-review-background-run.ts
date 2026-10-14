import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import {
  revealAzureDevOpsReviewWorktree,
  startAzureDevOpsReviewAgentInBackground
} from './azure-devops-review-agent'
import { openAzureDevOpsPullRequestPage } from './azure-devops-review-page'
import { switchAzureDevOpsReviewWorktree } from './azure-devops-review-worktree-switch'
import {
  advanceReviewAgentProgress,
  INITIAL_REVIEW_AGENT_PROGRESS,
  type ReviewAgentTarget
} from './azure-devops-review-agent-progress'
import type { AzureDevOpsReviewOptions } from '../../../shared/azure-devops-review-options'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewWorktreeInfo
} from '../../../shared/azure-devops-review-types'

// Why a cap: an agent closed before it settled must not keep a store subscription forever.
const WATCH_LIMIT_MS = 6 * 60 * 60 * 1000
const RESULT_TOAST_MS = 15_000

/** Starts an AI review without leaving the current work, and announces when it finishes. */
export async function runAzureDevOpsReviewInBackground(
  pullRequest: AzureDevOpsReviewPullRequest,
  options: AzureDevOpsReviewOptions,
  confirm: ConfirmationDialogContextValue
): Promise<void> {
  try {
    const worktree = await switchAzureDevOpsReviewWorktree(pullRequest.key, confirm)
    if (!worktree) {
      return
    }
    const launch = await startAzureDevOpsReviewAgentInBackground(pullRequest, worktree, options)
    if (!launch) {
      return
    }
    toast(
      translate('azureDevOpsReview.autoReviewStarted', 'Reviewing !{{value0}} in the background', {
        value0: pullRequest.pullRequestId
      }),
      { description: pullRequest.title }
    )
    watchReviewAgent(pullRequest, worktree, { worktreeId: worktree.worktreeId, ...launch })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function watchReviewAgent(
  pullRequest: AzureDevOpsReviewPullRequest,
  worktree: AzureDevOpsReviewWorktreeInfo,
  target: ReviewAgentTarget
): void {
  let progress = INITIAL_REVIEW_AGENT_PROGRESS
  const stop = (): void => {
    unsubscribe()
    clearTimeout(timeout)
  }
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.agentStatusByPaneKey === previous.agentStatusByPaneKey) {
      return
    }
    const result = advanceReviewAgentProgress(progress, state.agentStatusByPaneKey, target)
    progress = result.progress
    if (result.event === 'finished') {
      stop()
      toast.success(
        translate('azureDevOpsReview.autoReviewFinished', 'AI review of !{{value0}} finished', {
          value0: pullRequest.pullRequestId
        }),
        {
          description: pullRequest.title,
          duration: RESULT_TOAST_MS,
          action: {
            label: translate('azureDevOpsReview.autoReviewOpen', 'Open review'),
            onClick: () => openAzureDevOpsPullRequestPage(pullRequest.key)
          }
        }
      )
    } else if (result.event === 'needs-input') {
      toast.warning(
        translate('azureDevOpsReview.autoReviewNeedsInput', 'AI review of !{{value0}} needs you', {
          value0: pullRequest.pullRequestId
        }),
        {
          description: translate(
            'azureDevOpsReview.autoReviewNeedsInputDescription',
            'The agent is waiting for an answer or a permission.'
          ),
          duration: RESULT_TOAST_MS,
          action: {
            label: translate('azureDevOpsReview.autoReviewShowAgent', 'Show agent'),
            onClick: () => void revealAzureDevOpsReviewWorktree(worktree)
          }
        }
      )
    }
  })
  const timeout = setTimeout(stop, WATCH_LIMIT_MS)
}
