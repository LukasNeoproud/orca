import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { buildAzureDevOpsReviewAgentPrompt } from '../../../shared/azure-devops-review-prompt'
import { azureDevOpsReviewAgentLaunchArgs } from '../../../shared/azure-devops-review-agent-args'
import { orcaLaunchCliCommand } from '../../../shared/terminal-interaction-launch'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { pruneAzureDevOpsReviewChatLinks } from '@/lib/azure-devops-review-chat'
import { linkNextReviewTab, linkReviewTab, reviewTabIds } from '@/lib/azure-devops-review-tab-link'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'
import {
  normalizeAzureDevOpsReviewOptions,
  type AzureDevOpsReviewOptions
} from '../../../shared/azure-devops-review-options'

/** Launches the default agent in the review worktree with the review prompt, or `prompt` instead. */
export async function startAzureDevOpsReviewAgent(
  pullRequest: AzureDevOpsReviewPullRequest,
  worktree: { worktreeId: string; repoId: string },
  options?: AzureDevOpsReviewOptions,
  prompt?: string
): Promise<boolean> {
  return (await launchReviewAgent(pullRequest, worktree, options, prompt, false)) !== null
}

/** Like startAzureDevOpsReviewAgent, but leaves the user where they are; resolves to the agent's tab. */
export function startAzureDevOpsReviewAgentInBackground(
  pullRequest: AzureDevOpsReviewPullRequest,
  worktree: { worktreeId: string; repoId: string },
  options: AzureDevOpsReviewOptions,
  prompt?: string
): Promise<ReviewAgentLaunch | null> {
  return launchReviewAgent(pullRequest, worktree, options, prompt, true)
}

/** `tabId` is null for a tab the host opens itself (a structured chat). */
export type ReviewAgentLaunch = { tabId: string | null; launchedAt: number }

async function launchReviewAgent(
  pullRequest: AzureDevOpsReviewPullRequest,
  worktree: { worktreeId: string; repoId: string },
  options: AzureDevOpsReviewOptions | undefined,
  prompt: string | undefined,
  background: boolean
): Promise<ReviewAgentLaunch | null> {
  const launchedAt = Date.now()
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
    return null
  }
  // Why: launchAgentInNewTab creates the surface; seeding here would add a stray shell.
  if (!background && !activateAndRevealWorktree(worktreeId, { providesInitialSurface: true })) {
    toast.error(
      translate('azureDevOpsReview.openWorkspaceFailed', 'Could not open the review workspace.')
    )
    return null
  }
  const cli = orcaLaunchCliCommand(CLIENT_PLATFORM, import.meta.env.DEV)
  const reviewOptions = normalizeAzureDevOpsReviewOptions(options)
  const { agentArgs, mcp } = azureDevOpsReviewAgentLaunchArgs({
    agent,
    platform: CLIENT_PLATFORM,
    cli,
    settings: store.settings ?? null,
    options: reviewOptions
  })
  const tabsBeforeLaunch = reviewTabIds(useAppStore.getState(), worktreeId)
  const result = launchAgentInNewTab({
    // Why terminal by default: the agent's TUI keeps its auto mode and the chat/terminal toggle.
    ...(reviewOptions.surface === 'chat'
      ? { requestId: newAgentLaunchRequestId() }
      : {
          agentSessionLaunchPlan: adoptAgentSessionLaunchVerdict({
            route: 'terminal-tui',
            requestId: newAgentLaunchRequestId(),
            agent,
            worktreeId
          })
        }),
    agent,
    worktreeId,
    groupId: worktreeId,
    agentArgs,
    prompt: prompt ?? buildAzureDevOpsReviewAgentPrompt(pullRequest, { cli, mcp }, reviewOptions),
    promptDelivery: 'submit-after-ready',
    launchSource: 'task_page'
  })
  if (!result) {
    toast.error(
      translate('azureDevOpsReview.launchFailed', 'Could not build the agent launch command.')
    )
    return null
  }
  pruneAzureDevOpsReviewChatLinks()
  if (result.surface.kind !== 'local-terminal') {
    linkNextReviewTab(worktreeId, tabsBeforeLaunch, pullRequest.key)
    return { tabId: null, launchedAt }
  }
  const tabId = result.surface.tabId
  linkReviewTab(tabId, pullRequest.key, true)
  if (background) {
    // Why: an unopened workspace never mounts its panes, so a renderer-spawned agent would wait.
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tabId] })
  } else {
    focusTerminalTabSurface(tabId)
  }
  return { tabId, launchedAt }
}

/** Makes a host-created review worktree known to the renderer, then shows it. */
export async function revealAzureDevOpsReviewWorktree(worktree: {
  worktreeId: string
  repoId: string
}): Promise<boolean> {
  await useAppStore.getState().fetchWorktrees(worktree.repoId)
  return activateAndRevealWorktree(worktree.worktreeId) !== false
}
