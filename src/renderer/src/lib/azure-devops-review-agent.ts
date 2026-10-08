import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { buildAzureDevOpsReviewAgentPrompt } from '../../../shared/azure-devops-review-prompt'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

/** Launches the default agent in the review worktree with the review prompt. */
export async function startAzureDevOpsReviewAgent(
  pullRequest: AzureDevOpsReviewPullRequest,
  worktree: { worktreeId: string; repoId: string }
): Promise<boolean> {
  const worktreeId = worktree.worktreeId
  await useAppStore.getState().fetchWorktrees(worktree.repoId)
  const store = useAppStore.getState()
  const detected = await store.ensureDetectedAgents()
  const agent = resolveDefaultAgentForNewTab({
    defaultTuiAgent: store.settings?.defaultTuiAgent,
    detectedAgentIds: detected,
    disabledTuiAgents: store.settings?.disabledTuiAgents
  })
  if (!agent) {
    toast.error(translate('azureDevOpsReview.noAgent', 'No agent is available to run the review.'))
    return false
  }
  // Why: launchAgentInNewTab creates the surface; seeding here would add a stray shell.
  if (!activateAndRevealWorktree(worktreeId, { providesInitialSurface: true })) {
    toast.error(
      translate('azureDevOpsReview.openWorkspaceFailed', 'Could not open the review workspace.')
    )
    return false
  }
  const result = launchAgentInNewTab({
    agent,
    worktreeId,
    groupId: worktreeId,
    prompt: buildAzureDevOpsReviewAgentPrompt(pullRequest),
    promptDelivery: 'submit-after-ready',
    launchSource: 'task_page'
  })
  if (!result) {
    toast.error(
      translate('azureDevOpsReview.launchFailed', 'Could not build the agent launch command.')
    )
    return false
  }
  if (result.tabId) {
    focusTerminalTabSurface(result.tabId)
  }
  return true
}

/** Makes a host-created review worktree known to the renderer, then shows it. */
export async function revealAzureDevOpsReviewWorktree(worktree: {
  worktreeId: string
  repoId: string
}): Promise<boolean> {
  await useAppStore.getState().fetchWorktrees(worktree.repoId)
  return activateAndRevealWorktree(worktree.worktreeId) !== false
}
