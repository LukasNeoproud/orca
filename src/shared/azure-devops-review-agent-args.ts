import type { GlobalSettings } from './global-settings-types'
import {
  azureDevOpsReviewPermissionArg,
  type AzureDevOpsReviewOptions
} from './azure-devops-review-options'
import {
  azureDevOpsReviewMcpAgentArgs,
  type AzureDevOpsReviewToolAccess
} from './azure-devops-review-prompt'
import {
  resolvedTuiAgentArgsBypassPermissions,
  resolveTuiAgentLaunchArgs
} from './tui-agent-launch-defaults'
import {
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import { resolveLocalWindowsAgentStartupShell } from './windows-terminal-shell'
import type { TuiAgent } from './tui-agent'

export type AzureDevOpsReviewAgentLaunchArgs = {
  /** Undefined when the agent's saved default arguments apply unchanged. */
  agentArgs: string | undefined
  /** What the prompt points the agent at; tools the launch does not register fall back to the CLI. */
  tools: AzureDevOpsReviewToolAccess
}

/**
 * Pi's review flags. `--no-approve` keeps a PR checkout's own `.pi` extensions and settings from
 * loading, and spares a background review Pi's trust prompt.
 */
function piReviewArgs(shell: AgentStartupShell, extensionPath: string | undefined): string {
  return extensionPath
    ? `--no-approve --extension ${quoteStartupArg(extensionPath, shell)}`
    : '--no-approve'
}

/** Launch arguments for a review agent on a local host: review tools, permissions, then the user's defaults. */
export function azureDevOpsReviewAgentLaunchArgs(args: {
  agent: TuiAgent
  platform: NodeJS.Platform
  cli: string
  settings: Partial<Pick<GlobalSettings, 'agentDefaultArgs' | 'terminalWindowsShell'>> | null
  options: Pick<AzureDevOpsReviewOptions, 'permissions' | 'surface'>
  /** Orca's Pi extension with the review tools, when the desktop wrote one. */
  piExtensionPath?: string
}): AzureDevOpsReviewAgentLaunchArgs {
  const { agent, platform, cli, settings, options, piExtensionPath } = args
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
  const piArgs = agent === 'pi' ? piReviewArgs(shell, piExtensionPath) : null
  // Why terminal only: a structured Pi chat starts without these launch flags.
  const piTools = piArgs !== null && Boolean(piExtensionPath) && options.surface === 'terminal'
  // A structured chat takes its permissions from its own picker, not from TUI flags.
  const permissionArg =
    options.surface === 'terminal'
      ? azureDevOpsReviewPermissionArg(
          agent,
          options,
          resolvedTuiAgentArgsBypassPermissions(agent, settings, platform)
        )
      : null
  const launchArgs = [mcpArgs, piArgs, permissionArg].filter(Boolean)
  const defaultArgs = resolveTuiAgentLaunchArgs(agent, settings?.agentDefaultArgs)
  return {
    // Why first: user defaults may end with `--`, after which flags are literal.
    agentArgs: launchArgs.length
      ? [...launchArgs, defaultArgs].filter(Boolean).join(' ')
      : undefined,
    tools: mcpArgs ? 'mcp' : piTools ? 'pi-tools' : 'cli'
  }
}
