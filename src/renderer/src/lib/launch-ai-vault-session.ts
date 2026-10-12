import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import {
  createWebRuntimeSessionTerminal,
  isWebRuntimeSessionActive
} from '@/runtime/web-runtime-session'
import type { AiVaultAgent } from '../../../shared/ai-vault-types'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig
} from '../../../shared/agent-session-resume'
import type { TabSplitDirection } from '@/store/slices/tabs'
import type { WebRuntimeTerminalCreateOutcome } from '@/runtime/web-runtime-session'

export type LaunchAiVaultSessionInNewTabResult =
  | { tabId: string; groupId?: string }
  | { tabId: null; groupId?: string; runtimeLaunch: Promise<WebRuntimeTerminalCreateOutcome> }

export function launchAiVaultSessionInNewTab(args: {
  agent: AiVaultAgent
  worktreeId: string
  /** Undefined derives the owner; null explicitly keeps execution on the controlling runtime. */
  runtimeEnvironmentId?: string | null
  command: string
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: SleepingAgentLaunchConfig
  providerSession?: AgentProviderSessionMetadata
  targetGroupId?: string
  splitDirection?: TabSplitDirection
}): LaunchAiVaultSessionInNewTabResult {
  const store = useAppStore.getState()
  let targetGroupId = args.targetGroupId
  // Why before both paths: the runtime path used to return first and drop the split (#22791).
  const splitGroupId =
    args.splitDirection && targetGroupId
      ? store.createEmptySplitGroup(args.worktreeId, targetGroupId, args.splitDirection)
      : null
  targetGroupId = splitGroupId ?? targetGroupId
  const runtimeEnvironmentId =
    args.runtimeEnvironmentId === undefined
      ? getRuntimeEnvironmentIdForWorktree(store, args.worktreeId)
      : args.runtimeEnvironmentId
  if (runtimeEnvironmentId) {
    if (!isWebRuntimeSessionActive(runtimeEnvironmentId)) {
      if (splitGroupId) {
        store.closeEmptyGroup(args.worktreeId, splitGroupId)
      }
      return {
        tabId: null,
        ...(targetGroupId ? { groupId: targetGroupId } : {}),
        runtimeLaunch: Promise.resolve({
          status: 'failed',
          message: translate(
            'auto.lib.launch.ai.vault.session.runtimeUnavailable',
            'The owning runtime is unavailable.'
          )
        })
      }
    }
    const runtimeLaunch = createWebRuntimeSessionTerminal({
      worktreeId: args.worktreeId,
      environmentId: runtimeEnvironmentId,
      ...(targetGroupId ? { targetGroupId } : {}),
      agentSessionKind: 'resume',
      launchAgent: args.agent,
      command: args.command,
      ...(args.cwd ? { cwd: args.cwd } : {}),
      ...(args.env ? { env: args.env } : {}),
      ...(args.envToDelete ? { envToDelete: args.envToDelete } : {}),
      ...(args.launchConfig ? { launchConfig: args.launchConfig } : {}),
      ...(args.providerSession ? { providerSession: args.providerSession } : {}),
      ...(args.launchConfig ? { agentArgs: args.launchConfig.agentArgs } : {}),
      activate: true
    })
    const observedRuntimeLaunch = runtimeLaunch.then((outcome) => {
      if (outcome.status === 'created') {
        useAppStore.getState().setActiveTabType('terminal', args.worktreeId)
      } else if (splitGroupId) {
        // A refused or failed drop must not leave a blank pane behind.
        useAppStore.getState().closeEmptyGroup(args.worktreeId, splitGroupId)
      }
      return outcome
    })
    return {
      tabId: null,
      ...(targetGroupId ? { groupId: targetGroupId } : {}),
      runtimeLaunch: observedRuntimeLaunch
    }
  }

  const tab = args.cwd
    ? store.createTab(args.worktreeId, targetGroupId, undefined, { startupCwd: args.cwd })
    : store.createTab(args.worktreeId, targetGroupId)
  store.queueTabStartupCommand(tab.id, {
    command: args.command,
    ...(args.env ? { env: args.env } : {}),
    ...(args.envToDelete ? { envToDelete: args.envToDelete } : {}),
    ...(args.launchConfig ? { launchConfig: args.launchConfig, launchAgent: args.agent } : {}),
    ...(args.providerSession ? { resumeProviderSession: args.providerSession } : {}),
    telemetry: {
      agent_kind: tuiAgentToAgentKind(args.agent),
      launch_source: 'sidebar',
      request_kind: 'resume'
    }
  })
  store.setActiveTabType('terminal', args.worktreeId)

  persistAgentLaunchTabOrder(args.worktreeId, tab.id)

  return { tabId: tab.id, groupId: targetGroupId }
}
