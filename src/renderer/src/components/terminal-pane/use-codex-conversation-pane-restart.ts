import { useCallback } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { resolveAgentResumeLaunchTarget } from '@/lib/agent-resume-launch-target'
import {
  getExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '@/lib/worktree-runtime-owner'
import { buildAgentResumeStartupPlan, buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import type { ConversationContinuationMode } from '../../../../shared/conversation-continuation-view'
import type { PtyConnectionDeps } from './pty-connection-types'
import { isCodexConversationContinuationBusy } from './codex-conversation-continuation-source'

type RestartCodexPane = (
  paneId: number,
  startup: PtyConnectionDeps['startup'],
  onStartupBound?: () => void
) => void

export function useCodexConversationPaneRestart(args: {
  managerRef: React.RefObject<PaneManager | null>
  restartCodexPane: RestartCodexPane
  tabId: string
  worktreeId: string
}) {
  const { managerRef, restartCodexPane, tabId, worktreeId } = args
  return useCallback(
    async (input: {
      paneId: number
      mode: ConversationContinuationMode
      sourceProviderSessionId: string
      providerSessionId: string
      transcriptPath: string | null
      reference?: string
    }): Promise<void> => {
      if (input.mode === 'original') {
        return
      }
      const state = useAppStore.getState()
      const pane = managerRef.current?.getPanes().find((candidate) => candidate.id === input.paneId)
      if (!pane) {
        throw new Error('The terminal pane is no longer available.')
      }
      const current = state.agentStatusByPaneKey[makePaneKey(tabId, pane.leafId)]
      if (
        current?.agentType !== 'codex' ||
        current.providerSession?.id !== input.sourceProviderSessionId
      ) {
        throw new Error('The Codex session is no longer active in this pane.')
      }
      if (isCodexConversationContinuationBusy(state, { pane, tabId })) {
        throw new Error('Finish or stop the current turn before switching.')
      }

      const connectionId = getConnectionIdFromState(state, worktreeId)
      if (!getRuntimeEnvironmentIdForWorktree(state, worktreeId) && connectionId !== null) {
        throw new Error('This Codex session must continue on its SSH host.')
      }
      const launchConfig = state.getAgentLaunchConfigForStatusEntry(current)
      const launchTarget = resolveAgentResumeLaunchTarget({
        projectRuntime: getLocalProjectExecutionRuntimeContext(state, worktreeId),
        connectionId,
        executionHostId: getExecutionHostIdForWorktree(state, worktreeId),
        worktreePath: state.getKnownWorktreeById(worktreeId)?.path,
        terminalWindowsShell: state.settings?.terminalWindowsShell,
        tabShellOverride: state.tabsByWorktree[worktreeId]?.find(
          (candidate) => candidate.id === tabId
        )?.shellOverride
      })
      const base = {
        agent: 'codex' as const,
        cmdOverrides: state.settings?.agentCmdOverrides ?? {},
        platform: launchTarget.platform,
        shell: launchTarget.shell,
        agentArgs:
          launchConfig?.agentArgs ??
          resolveTuiAgentLaunchArgs('codex', state.settings?.agentDefaultArgs),
        agentEnv:
          launchConfig?.agentEnv ??
          resolveTuiAgentLaunchEnv('codex', state.settings?.agentDefaultEnv),
        ...(launchConfig?.agentCommand ? { agentCommand: launchConfig.agentCommand } : {})
      }
      const resumeProviderSession: AgentProviderSessionMetadata | null =
        input.mode === 'compacted'
          ? {
              key: 'session_id',
              id: input.providerSessionId,
              ...(input.transcriptPath ? { transcriptPath: input.transcriptPath } : {})
            }
          : null
      const plan = resumeProviderSession
        ? buildAgentResumeStartupPlan({ ...base, providerSession: resumeProviderSession })
        : buildAgentStartupPlan({ ...base, prompt: '', allowEmptyPromptLaunch: true })
      if (!plan) {
        throw new Error('Could not build the Codex launch command.')
      }
      const startup: PtyConnectionDeps['startup'] = {
        command: plan.launchCommand,
        env: { ...plan.env, ORCA_AGENT_LAUNCH_TOKEN: createBrowserUuid() },
        launchConfig: plan.launchConfig,
        launchAgent: 'codex',
        ...(plan.startupCommandDelivery
          ? { startupCommandDelivery: plan.startupCommandDelivery }
          : {}),
        ...(resumeProviderSession ? { resumeProviderSession } : {}),
        ...(input.mode === 'reference' && input.reference?.trim()
          ? { draftPrompt: input.reference.trim() }
          : {})
      }

      await new Promise<void>((resolve, reject) => {
        let startupBound = false
        let unsubscribe: (() => void) | null = null
        const expectedProviderSessionId = resumeProviderSession?.id
        const rejectAfterTimeout = (): void => {
          unsubscribe?.()
          reject(new Error('Codex did not confirm the expected session in this pane in time.'))
        }
        const timer = window.setTimeout(rejectAfterTimeout, 30_000)
        const resolveWhenSessionConfirmed = (): void => {
          if (
            !expectedProviderSessionId ||
            useAppStore.getState().agentStatusByPaneKey[makePaneKey(tabId, pane.leafId)]
              ?.providerSession?.id === expectedProviderSessionId
          ) {
            window.clearTimeout(timer)
            unsubscribe?.()
            resolve()
          }
        }
        unsubscribe = useAppStore.subscribe(() => {
          if (startupBound) {
            resolveWhenSessionConfirmed()
          }
        })
        try {
          restartCodexPane(input.paneId, startup, () => {
            startupBound = true
            resolveWhenSessionConfirmed()
          })
        } catch (error) {
          window.clearTimeout(timer)
          unsubscribe?.()
          reject(error)
        }
      })
    },
    [managerRef, restartCodexPane, tabId, worktreeId]
  )
}
