import type { RpcClient } from '../transport/rpc-client'
import {
  launchAgentWithPrompt,
  type MobilePromptedAgentLaunch
} from '../session/pr-ai-triage-launch'
import { buildAzureDevOpsReviewAgentPrompt } from '../../../src/shared/azure-devops-review-prompt'
import type { AzureDevOpsReviewOptions } from '../../../src/shared/azure-devops-review-options'
import type {
  AzureDevOpsReviewPullRequest,
  AzureDevOpsReviewWorktreeResult
} from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'

type AgentLaunchArgs = { agentArgs: string | null; mcp: boolean; cli: string }

export type AzureDevOpsReviewAgentLaunch = MobilePromptedAgentLaunch & {
  /** The review workspace the agent runs in, once it was switched to the pull request. */
  worktreeId?: string
}

/**
 * Switches the shared review workspace to the pull request, then starts the default agent there
 * with the review prompt (or `buildPrompt`'s), registered with the same MCP tools as on the desktop.
 */
export async function launchAzureDevOpsReviewAgent(args: {
  client: RpcClient
  hostCapabilities: readonly string[] | null | undefined
  pullRequest: AzureDevOpsReviewPullRequest
  options: AzureDevOpsReviewOptions
  /** Replaces the review prompt; gets the host's CLI name for the commands it spells out. */
  buildPrompt?: (tools: { cli: string; mcp: boolean }) => string
  /** Asks before uncommitted changes in the review workspace are discarded. */
  confirmDiscard: () => Promise<boolean>
}): Promise<AzureDevOpsReviewAgentLaunch> {
  const { client, pullRequest, options } = args
  const open = (discardChanges: boolean) =>
    azureDevOpsReviewRequest<AzureDevOpsReviewWorktreeResult>(
      client,
      'azureDevOpsReview.openWorktree',
      { pullRequestKey: pullRequest.key, discardChanges }
    )
  let opened: AzureDevOpsReviewWorktreeResult
  try {
    opened = await open(false)
    if (!opened.ok && opened.reason === 'dirty') {
      if (!(await args.confirmDiscard())) {
        return { kind: 'not-started', message: 'The review workspace was left as it is.' }
      }
      opened = await open(true)
    }
  } catch (error) {
    return { kind: 'not-started', message: error instanceof Error ? error.message : String(error) }
  }
  if (!opened.ok) {
    return { kind: 'not-started', message: opened.message }
  }
  const worktreeId = opened.worktree.worktreeId
  const launched = await launchAgentWithPrompt({
    client,
    hostCapabilities: args.hostCapabilities,
    worktreeId,
    actionId: null,
    prompt: '',
    launchSource: 'task_page',
    beforeLaunch: async (agent) => {
      // Mobile has no surface choice: the host picks it, and permissions only shape a terminal.
      const launch = await azureDevOpsReviewRequest<AgentLaunchArgs>(
        client,
        'azureDevOpsReview.agentLaunchArgs',
        { agent, permissions: options.permissions, surface: 'terminal' }
      )
      const tools = { cli: launch.cli, mcp: launch.mcp }
      return {
        prompt:
          args.buildPrompt?.(tools) ??
          buildAzureDevOpsReviewAgentPrompt(pullRequest, tools, options),
        ...(launch.agentArgs !== null ? { agentArgs: launch.agentArgs } : {})
      }
    }
  })
  return { ...launched, worktreeId }
}
