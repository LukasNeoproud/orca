import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import {
  azureDevOpsReviewMcpAgentArgs,
  buildAzureDevOpsReviewAgentPrompt
} from '../../../shared/azure-devops-review-prompt'
import { orcaLaunchCliCommand } from '../../../shared/terminal-interaction-launch'
import {
  resolvedTuiAgentArgsBypassPermissions,
  resolveTuiAgentLaunchArgs
} from '../../../shared/tui-agent-launch-defaults'
import { resolveStartupShell } from '../../../shared/tui-agent-startup-shell'
import { resolveLocalWindowsAgentStartupShell } from '../../../shared/windows-terminal-shell'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { pruneAzureDevOpsReviewChatLinks } from '@/lib/azure-devops-review-chat'
import { linkNextReviewTab, linkReviewTab, reviewTabIds } from '@/lib/azure-devops-review-tab-link'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'
import {
  azureDevOpsReviewPermissionArg,
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
  // Why local shell: review worktrees are never on SSH hosts.
  const shell = resolveStartupShell(
    CLIENT_PLATFORM,
    resolveLocalWindowsAgentStartupShell({
      platform: CLIENT_PLATFORM,
      isRemote: false,
      terminalWindowsShell: store.settings?.terminalWindowsShell
    })
  )
  const cli = orcaLaunchCliCommand(CLIENT_PLATFORM, import.meta.env.DEV)
  const mcpArgs = azureDevOpsReviewMcpAgentArgs(agent, shell, cli)
  const defaultArgs = resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs)
  const reviewOptions = normalizeAzureDevOpsReviewOptions(options)
  // A structured chat takes its permissions from its own picker, not from TUI flags.
  const permissionArg =
    reviewOptions.surface === 'terminal'
      ? azureDevOpsReviewPermissionArg(
          agent,
          reviewOptions,
          resolvedTuiAgentArgsBypassPermissions(agent, store.settings, CLIENT_PLATFORM)
        )
      : null
  const launchArgs = [mcpArgs, permissionArg].filter(Boolean)
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
    // Why first: user defaults may end with `--`, after which flags are literal.
    agentArgs: launchArgs.length
      ? [...launchArgs, defaultArgs].filter(Boolean).join(' ')
      : undefined,
    prompt:
      prompt ??
      buildAzureDevOpsReviewAgentPrompt(pullRequest, { cli, mcp: mcpArgs !== null }, reviewOptions),
    promptDelivery: 'submit-after-ready',
    launchSource: 'task_page'
  })
  if (!result) {
    toast.error(
      translate('azureDevOpsReview.launchFailed', 'Could not build the agent launch command.')
    )
    return false
  }
  pruneAzureDevOpsReviewChatLinks()
  if (result.surface.kind === 'local-terminal') {
    linkReviewTab(result.surface.tabId, pullRequest.key, true)
    focusTerminalTabSurface(result.surface.tabId)
  } else {
    linkNextReviewTab(worktreeId, tabsBeforeLaunch, pullRequest.key)
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
