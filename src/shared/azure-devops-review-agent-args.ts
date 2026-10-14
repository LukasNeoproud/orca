import type { GlobalSettings } from './global-settings-types'
import {
  azureDevOpsReviewPermissionArg,
  type AzureDevOpsReviewOptions
} from './azure-devops-review-options'
import { azureDevOpsReviewMcpAgentArgs } from './azure-devops-review-prompt'
import {
  resolvedTuiAgentArgsBypassPermissions,
  resolveTuiAgentLaunchArgs
} from './tui-agent-launch-defaults'
import { resolveStartupShell } from './tui-agent-startup-shell'
import { resolveLocalWindowsAgentStartupShell } from './windows-terminal-shell'
import type { TuiAgent } from './tui-agent'

export type AzureDevOpsReviewAgentLaunchArgs = {
  /** Undefined when the agent's saved default arguments apply unchanged. */
  agentArgs: string | undefined
  /** Whether `orca ado mcp` is registered for this launch; otherwise the prompt points at the CLI. */
  mcp: boolean
}

/** Launch arguments for a review agent on a local host: inline MCP, permissions, then the user's defaults. */
export function azureDevOpsReviewAgentLaunchArgs(args: {
  agent: TuiAgent
  platform: NodeJS.Platform
  cli: string
  settings: Partial<Pick<GlobalSettings, 'agentDefaultArgs' | 'terminalWindowsShell'>> | null
  options: Pick<AzureDevOpsReviewOptions, 'permissions' | 'surface'>
}): AzureDevOpsReviewAgentLaunchArgs {
  const { agent, platform, cli, settings, options } = args
  // Why local shell: review worktrees are never on SSH hosts.
  const shell = resolveStartupShell(
    platform,
    resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote: false,
      terminalWindowsShell: settings?.terminalWindowsShell
    })
  )
  const mcpArgs = azureDevOpsReviewMcpAgentArgs(agent, shell, cli)
  // A structured chat takes its permissions from its own picker, not from TUI flags.
  const permissionArg =
    options.surface === 'terminal'
      ? azureDevOpsReviewPermissionArg(
          agent,
          options,
          resolvedTuiAgentArgsBypassPermissions(agent, settings, platform)
        )
      : null
  const launchArgs = [mcpArgs, permissionArg].filter(Boolean)
  const defaultArgs = resolveTuiAgentLaunchArgs(agent, settings?.agentDefaultArgs)
  return {
    // Why first: user defaults may end with `--`, after which flags are literal.
    agentArgs: launchArgs.length
      ? [...launchArgs, defaultArgs].filter(Boolean).join(' ')
      : undefined,
    mcp: mcpArgs !== null
  }
}
