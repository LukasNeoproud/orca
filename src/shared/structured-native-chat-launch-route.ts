/**
 * The one place that answers whether an explicit structured-chat action can run.
 *
 * Ordinary agent and worker launches remain terminal-backed. The display default
 * only decides whether those terminal tabs initially show xterm or Chat UI.
 */

import { isAgentSessionHandleProvider } from './agent-session-provider-handle'
import type { GlobalSettings } from './global-settings-types'
import type { ProjectExecutionRuntimeResolution } from './project-execution-runtime'
import { STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY } from './protocol-version'
import type { TuiAgent } from './tui-agent'

export type NativeChatDefaultSettings = Pick<
  GlobalSettings,
  'experimentalNativeChat' | 'experimentalStructuredNativeChat' | 'openAgentTabsInChatByDefault'
>

/** Why a launch that the user's default asked to be structured cannot be. */
export type StructuredNativeChatBlocker =
  | 'agent-without-structured-session'
  | 'draft-prompt'
  | 'floating-workspace'
  | 'tui-launch-customization'
  | 'remote-execution-host'
  | 'project-runtime'
  | 'runtime-capability'
  /** The owning host has not answered yet. Distinct from `runtime-capability`, which is the
   *  host saying no: an unestablished answer must not read as a refusal. */
  | 'runtime-capability-unknown'

export type StructuredNativeChatSupport =
  | { supported: true }
  | { supported: false; blocker: StructuredNativeChatBlocker }

export type StructuredNativeChatSupportInput = {
  agent: TuiAgent
  executionHostId: string
  /** Capabilities of the host this launch would run on. `null` = not yet established. */
  hostCapabilities: readonly string[] | null
  workspaceKind?: 'git-worktree' | 'folder' | 'floating'
  projectRuntime?: ProjectExecutionRuntimeResolution | null
  /** A draft stays terminal-backed: the composer, not a turn, owns unsent text. */
  isDraftPrompt?: boolean
  requiresTuiLaunchCustomization?: boolean
}

/** The user's default for a new agent tab: native chat rather than the raw TUI. */
export function agentTabsDefaultToNativeChat(
  settings: Partial<NativeChatDefaultSettings> | null | undefined
): boolean {
  return (
    settings?.experimentalNativeChat === true && settings?.openAgentTabsInChatByDefault === true
  )
}

export function resolveStructuredNativeChatSupport(
  input: StructuredNativeChatSupportInput
): StructuredNativeChatSupport {
  if (!isAgentSessionHandleProvider(input.agent)) {
    return { supported: false, blocker: 'agent-without-structured-session' }
  }
  if (input.isDraftPrompt === true) {
    return { supported: false, blocker: 'draft-prompt' }
  }
  if (input.workspaceKind === 'floating') {
    return { supported: false, blocker: 'floating-workspace' }
  }
  if (input.requiresTuiLaunchCustomization === true) {
    return { supported: false, blocker: 'tui-launch-customization' }
  }
  if (input.executionHostId !== 'local') {
    return { supported: false, blocker: 'remote-execution-host' }
  }
  const projectRuntime = input.projectRuntime
  if (projectRuntime?.status === 'repair-required' || projectRuntime?.runtime.kind === 'wsl') {
    return { supported: false, blocker: 'project-runtime' }
  }
  if (input.hostCapabilities === null) {
    return { supported: false, blocker: 'runtime-capability-unknown' }
  }
  if (!input.hostCapabilities.includes(STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY)) {
    return { supported: false, blocker: 'runtime-capability' }
  }
  return { supported: true }
}
