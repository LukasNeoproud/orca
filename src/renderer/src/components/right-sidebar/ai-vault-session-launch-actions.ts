import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  buildAiVaultResumeCopyCommandForWorktree,
  buildAiVaultResumeStartupForWorktree
} from '@/lib/ai-vault-resume-command'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import { useAppStore } from '@/store'
import type { AiVaultAgent, AiVaultSession } from '../../../../shared/ai-vault-types'
import { prepareAiVaultSessionForResume } from '@/lib/ai-vault-session-resume-preparation'
import type { Worktree } from '../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import { agentLabel } from './ai-vault-session-filters'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'
import { prepareAiVaultSessionContinuation } from './ai-vault-session-continuation'
import type { AgentSessionContinuationRequest } from '@/lib/agent-session-continuation'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { startStructuredAgentLaunch } from '@/lib/structured-agent-session-launch'
import { isAgentSessionHandleProvider } from '../../../../shared/agent-session-provider-handle'
import { resolveAiVaultTargetWorkspacePath } from './ai-vault-session-launch-target'
import type { AgentSessionHistoryOpenMode } from '../../../../shared/agent-session-history-open-mode'
import { openAiVaultSession, type AiVaultSessionOpenedTarget } from '@/lib/ai-vault-session-open'
import { activateRunningOriginalAiVaultSessionPane } from './ai-vault-original-pane-actions'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { isWslStoredAiVaultSessionFile } from '@/lib/ai-vault-resume-target'
import {
  notifyAiVaultSessionPreparationFailure,
  notifyAiVaultSessionResumeInChatFailure,
  resolveAiVaultSessionLaunchTargetOrNotify
} from './ai-vault-session-launch-feedback'
import {
  activateAiVaultResumeWorkspace,
  activateQueuedAiVaultTerminalSession,
  activateRememberedAiVaultSession,
  classifyRememberedAiVaultSession
} from './ai-vault-session-activation'

export function useAiVaultSessionLaunchActions({
  activeWorktree,
  activeWorktreeId,
  targetState,
  agentCmdOverrides
}: {
  activeWorktree: Worktree | null
  activeWorktreeId: string | null
  targetState: AiVaultSessionResumeTargetState
  agentCmdOverrides?: Partial<Record<AiVaultAgent, string | null>>
}) {
  const [continuationRequest, setContinuationRequest] =
    useState<AgentSessionContinuationRequest | null>(null)

  const buildResumeCommand = useCallback(
    (session: AiVaultSession, worktreeId?: string | null): string =>
      buildAiVaultResumeCopyCommandForWorktree({
        state: useAppStore.getState(),
        worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
        session,
        commandOverride: agentCmdOverrides?.[session.agent]
      }),
    [activeWorktree?.id, activeWorktreeId, agentCmdOverrides]
  )

  const buildResumeStartup = useCallback(
    (session: AiVaultSession, worktreeId?: string | null) =>
      buildAiVaultResumeStartupForWorktree({
        state: useAppStore.getState(),
        worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
        session,
        commandOverride: agentCmdOverrides?.[session.agent]
      }),
    [activeWorktree?.id, activeWorktreeId, agentCmdOverrides]
  )

  const copyResumeCommand = useCallback(
    async (session: AiVaultSession, worktreeId?: string | null): Promise<void> => {
      try {
        const preparedSession = await prepareAiVaultSessionForResume(session)
        await window.api.ui.writeClipboardText(buildResumeCommand(preparedSession, worktreeId))
        toast.success(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.resumeCommandCopied',
            'Resume command copied'
          )
        )
      } catch (error) {
        notifyAiVaultSessionPreparationFailure(error)
      }
    },
    [buildResumeCommand]
  )

  const openInTerminal = useCallback(
    async (
      session: AiVaultSession,
      targetWorktreeId?: string
    ): Promise<AiVaultSessionOpenedTarget | null> => {
      const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
        sessionFilePath: session.filePath,
        sessionExecutionHostId: session.executionHostId,
        activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
        targetWorktreeId,
        targetState
      })
      if (!targetId) {
        return null
      }

      const showQueuedToast = (): void => {
        toast.success(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.agentSessionQueued',
            '{{value0}} session queued',
            { value0: agentLabel(session.agent) }
          )
        )
      }
      const preparedSession = await prepareAiVaultSessionForResume(session)
      const launchResult = launchAiVaultSessionInNewTab({
        agent: session.agent,
        worktreeId: targetId.worktreeId,
        ...buildResumeStartup(preparedSession, targetId.worktreeId)
      })
      if (launchResult.tabId === null) {
        const outcome = await launchResult.runtimeLaunch
        if (outcome.status === 'failed') {
          toast.error(
            outcome.message ||
              translate(
                'auto.lib.launch.agent.in.new.tab.11cce5cc77',
                'Could not launch {{value0}} in a new terminal.',
                { value0: agentLabel(session.agent) }
              )
          )
          return null
        }
        if (useAppStore.getState().activeWorktreeId !== targetId.worktreeId) {
          activateAiVaultResumeWorkspace(targetId.worktreeId)
        }
        showQueuedToast()
        return null
      }
      if (useAppStore.getState().activeWorktreeId !== targetId.worktreeId) {
        activateAiVaultResumeWorkspace(targetId.worktreeId)
      }
      showQueuedToast()
      return { kind: 'terminal', workspaceId: targetId.worktreeId, tabId: launchResult.tabId }
    },
    [activeWorktree?.id, activeWorktreeId, buildResumeStartup, targetState]
  )

  const openInStructuredChat = useCallback(
    async (
      session: AiVaultSession,
      targetWorktreeId?: string
    ): Promise<AiVaultSessionOpenedTarget | null> => {
      if (!isAgentSessionHandleProvider(session.agent)) {
        return null
      }
      const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
        sessionFilePath: session.filePath,
        sessionExecutionHostId: session.executionHostId,
        activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
        targetWorktreeId,
        targetState
      })
      if (!targetId) {
        return null
      }
      if (
        session.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
        isWslStoredAiVaultSessionFile(session.filePath)
      ) {
        toast.error(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.structuredResumeLocalOnly',
            'Chat UI resume is available for local sessions only.'
          )
        )
        return null
      }
      const worktreeId = targetId.worktreeId
      // Codex rows can live under a shared legacy home; the same preparation the terminal resume
      // runs re-pins them, and its result is what names the conversation the host will look for.
      const preparedSession = await prepareAiVaultSessionForResume(session)
      const launch = startStructuredAgentLaunch(worktreeId, session.agent, {
        resumeFrom: { providerSessionId: preparedSession.sessionId }
      })
      await launch.launchResult
      if (useAppStore.getState().activeWorktreeId !== worktreeId) {
        activateAiVaultResumeWorkspace(worktreeId)
      }
      return { kind: 'structured', workspaceId: worktreeId, sessionId: launch.sessionId }
    },
    [activeWorktree?.id, activeWorktreeId, targetState]
  )

  const handleOpen = useCallback(
    (
      session: AiVaultSession,
      mode: AgentSessionHistoryOpenMode,
      targetWorktreeId?: string
    ): void => {
      void openAiVaultSession(session, mode, targetWorktreeId, {
        activateRemembered: activateRememberedAiVaultSession,
        activateExistingTerminal: (ownedSession) => {
          const running = activateRunningOriginalAiVaultSessionPane(ownedSession)
          if (
            running === 'activated' ||
            running === 'workspace-unavailable' ||
            running === 'live'
          ) {
            return 'live'
          }
          return activateQueuedAiVaultTerminalSession(ownedSession) ? 'pending' : null
        },
        activateExistingStructured: async (ownedSession) => {
          await activateAiVaultStructuredSession(ownedSession)
        },
        classifyRemembered: classifyRememberedAiVaultSession,
        ownershipUnverifiable: () => {
          toast.error(
            translate(
              'auto.components.right.sidebar.AiVaultPanel.sessionOwnershipUnverifiable',
              'Orca cannot verify whether this session is still running, so it will not start a second writer.'
            )
          )
        },
        openTerminal: openInTerminal,
        openStructured: openInStructuredChat
      }).catch(
        mode === 'structured'
          ? notifyAiVaultSessionResumeInChatFailure
          : notifyAiVaultSessionPreparationFailure
      )
    },
    [openInStructuredChat, openInTerminal]
  )

  const handleResume = useCallback(
    (session: AiVaultSession, targetWorktreeId?: string): void => {
      handleOpen(session, 'terminal', targetWorktreeId)
    },
    [handleOpen]
  )

  const handleResumeInNewChat = useCallback(
    (session: AiVaultSession, targetWorktreeId?: string): void => {
      handleOpen(session, 'structured', targetWorktreeId)
    },
    [handleOpen]
  )

  const handleContinueInNewSession = useCallback(
    (session: AiVaultSession, targetWorktreeId: string): void => {
      const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
        sessionFilePath: session.filePath,
        sessionExecutionHostId: session.executionHostId,
        activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
        targetWorktreeId,
        targetState
      })
      if (!targetId) {
        return
      }

      const targetWorkspacePath = resolveAiVaultTargetWorkspacePath(
        targetState,
        targetId.worktreeId
      )
      if (!targetWorkspacePath) {
        toast.error(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
            'Open a workspace before resuming a session.'
          )
        )
        return
      }
      setContinuationRequest(
        prepareAiVaultSessionContinuation({
          session,
          targetWorktreeId: targetId.worktreeId,
          targetWorkspacePath
        })
      )
    },
    [activeWorktree?.id, activeWorktreeId, targetState]
  )

  const handleContinuationDialogOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setContinuationRequest(null)
    }
  }, [])

  return {
    buildResumeStartup,
    copyResumeCommand,
    handleOpen,
    handleResume,
    handleResumeInNewChat,
    handleContinueInNewSession,
    continuationRequest,
    handleContinuationDialogOpenChange
  }
}
