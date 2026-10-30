import { toast } from 'sonner'
import type { AzureDevOpsReviewAgentPrompt } from './azure-devops-review-agent'
import { openAzureDevOpsFeedbackWorktree } from './azure-devops-review-client'
import { buildAzureDevOpsFeedbackAgentPrompt } from '../../../shared/azure-devops-feedback-prompt'
import type {
  AzureDevOpsFeedbackWorktreeInfo,
  AzureDevOpsReviewDetail
} from '../../../shared/azure-devops-review-types'
import type { AzureDevOpsReviewLanguage } from '../../../shared/azure-devops-review-options'

/** The author's branch workspace for the pull request; null when opening it failed (already reported). */
export async function openAzureDevOpsFeedbackWorkspace(
  pullRequestKey: string
): Promise<(AzureDevOpsFeedbackWorktreeInfo & { piExtensionPath?: string }) | null> {
  const result = await openAzureDevOpsFeedbackWorktree(pullRequestKey)
  if (!result.ok) {
    toast.error(result.message)
    return null
  }
  return { ...result.worktree, piExtensionPath: result.piExtensionPath }
}

/** The launch prompt for an agent that addresses the chosen review threads on the user's own PR. */
export function azureDevOpsFeedbackAgentPrompt(
  detail: AzureDevOpsReviewDetail,
  threadIds: readonly number[],
  instruction: string,
  language: AzureDevOpsReviewLanguage
): AzureDevOpsReviewAgentPrompt {
  const chosen = new Set(threadIds)
  const threads = detail.threads.filter((thread) => chosen.has(thread.id))
  return (tools) =>
    buildAzureDevOpsFeedbackAgentPrompt({
      pullRequest: detail.pullRequest,
      threads,
      tools,
      language,
      instruction
    })
}
