import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { isResumableTuiAgent } from '../../../shared/agent-session-resume'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { buildAiVaultResumeStartupForWorktree } from '@/lib/ai-vault-resume-command'
import { prepareAiVaultSessionForResume } from '@/lib/ai-vault-session-resume-preparation'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import {
  findOriginalAiVaultSessionPaneInIndex,
  getAiVaultOriginalPaneIndex
} from '@/components/right-sidebar/ai-vault-original-pane-index'
import { classifyRememberedAiVaultSession } from '@/components/right-sidebar/ai-vault-session-activation'
import { openAiVaultSession, type AiVaultSessionOpenedTarget } from './ai-vault-session-open'
import { findQueuedAiVaultSessionTerminal } from './ai-vault-session-terminal-owner'
import type { BacklogRoute } from './backlog-rpc'
import type { BacklogTaskConversationOption } from './backlog-task-handoff-options'
import { getBacklogTaskConversationOptions } from './backlog-task-handoff-options'
import { activateBacklogTaskWorkspace } from './backlog-task-conversation-activation'
import type { PreparedBacklogConversation } from './backlog-task-handoff-preparation'
import { useAppStore } from '@/store'
import { classifyPairedProviderOwner } from './backlog-task-paired-terminal-owner'
import { waitForRestoredBacklogTerminal } from './backlog-task-restored-terminal'

async function findHistorySession(
  route: BacklogRoute,
  conversation: BacklogTaskConversationOption
): Promise<AiVaultSession | null> {
  const providerSessionId = conversation.providerSession?.id
  if (!providerSessionId) {
    return null
  }
  const result = await window.api.aiVault.listSessions({
    executionHostScope: route.executionHostId,
    unlimited: true,
    force: true
  })
  return (
    result.sessions.find(
      (session) =>
        session.agent === conversation.agent &&
        session.sessionId === providerSessionId &&
        session.executionHostId === route.executionHostId &&
        session.filePath === conversation.history?.filePath &&
        (conversation.history.codexHome === undefined ||
          session.codexHome === conversation.history.codexHome)
    ) ?? null
  )
}

async function refreshExistingConversation(
  route: BacklogRoute,
  conversation: BacklogTaskConversationOption
): Promise<BacklogTaskConversationOption> {
  const options = await getBacklogTaskConversationOptions(route)
  const refreshed = options.find((candidate) =>
    conversation.structuredSessionId
      ? candidate.structuredSessionId === conversation.structuredSessionId
      : candidate.agent === conversation.agent &&
        candidate.providerSession?.id === conversation.providerSession?.id
  )
  if (!refreshed) {
    throw new Error('The selected conversation is no longer available in this workspace.')
  }
  return refreshed
}

function terminalConversation(
  conversation: BacklogTaskConversationOption,
  tabId: string,
  launchedTerminal: boolean,
  terminal: BacklogTaskConversationOption['terminal'] = { tabId }
): PreparedBacklogConversation {
  return {
    surface: 'terminal',
    agent: conversation.agent,
    session: {
      ...(conversation.providerSession ? { providerSession: conversation.providerSession } : {}),
      ...(conversation.history ? { history: conversation.history } : {})
    },
    terminal: {
      ...terminal,
      ...(isResumableTuiAgent(conversation.agent) ? { launchAgent: conversation.agent } : {})
    },
    launchedTerminal
  }
}

function structuredConversation(
  conversation: BacklogTaskConversationOption,
  sessionId: string
): PreparedBacklogConversation {
  return {
    surface: 'structured',
    agent: conversation.agent,
    session: {
      structuredSessionId: sessionId,
      ...(conversation.providerSession ? { providerSession: conversation.providerSession } : {}),
      ...(conversation.history ? { history: conversation.history } : {})
    }
  }
}

export async function prepareExistingBacklogConversation(
  route: BacklogRoute,
  staleConversation: BacklogTaskConversationOption
): Promise<PreparedBacklogConversation> {
  const conversation = await refreshExistingConversation(route, staleConversation)
  if (conversation.surface === 'structured') {
    if (!conversation.structuredSessionId) {
      throw new Error('The selected structured conversation is unavailable.')
    }
    return structuredConversation(conversation, conversation.structuredSessionId)
  }
  if (conversation.terminal) {
    return terminalConversation(
      conversation,
      conversation.terminal.tabId,
      false,
      conversation.terminal
    )
  }
  if (!conversation.providerSession || !conversation.history) {
    throw new Error('The selected conversation cannot be restored.')
  }
  const historySession = await findHistorySession(route, conversation)
  if (!historySession) {
    throw new Error('The selected conversation history is no longer available.')
  }
  let prepared: PreparedBacklogConversation | null = null
  let failure: Error | null = null
  const pairedEnvironment =
    parseExecutionHostId(route.executionHostId)?.kind === 'runtime'
      ? route.runtimeEnvironmentId
      : null
  const pairedOwner = () =>
    classifyPairedProviderOwner({
      environmentId: pairedEnvironment!,
      association: {
        executionHostId: 'local',
        session: { providerSession: conversation.providerSession },
        terminal: conversation.terminal
      },
      agent: conversation.agent
    })
  const captureTarget = (target: AiVaultSessionOpenedTarget, launchedTerminal: boolean): void => {
    if (target.workspaceId !== route.workspaceId) {
      failure = new Error('This conversation is already being restored in another workspace.')
      return
    }
    prepared =
      target.kind === 'terminal'
        ? terminalConversation(conversation, target.tabId, launchedTerminal)
        : structuredConversation(conversation, target.sessionId)
  }
  const openDeps = {
    activateExistingTerminal: (session) => {
      const state = useAppStore.getState()
      const original = findOriginalAiVaultSessionPaneInIndex(
        getAiVaultOriginalPaneIndex(state),
        session
      )
      if (original) {
        if (original.worktreeId !== route.workspaceId) {
          failure = new Error('This conversation is already being restored in another workspace.')
        } else {
          const ptyId =
            state.terminalLayoutsByTabId[original.tabId]?.ptyIdsByLeafId?.[original.leafId]
          prepared = terminalConversation(conversation, original.tabId, false, {
            ...original,
            ...(ptyId ? { ptyId } : {})
          })
        }
        return 'live'
      }
      const queued = findQueuedAiVaultSessionTerminal(state, session)
      if (queued) {
        captureTarget(
          { kind: 'terminal', workspaceId: queued.workspaceId, tabId: queued.tabId },
          true
        )
        return 'pending'
      }
      return null
    },
    activateExistingStructured: async (session) => {
      const owner = session.structuredSession
      if (owner) {
        captureTarget(
          { kind: 'structured', workspaceId: owner.workspaceId, sessionId: owner.sessionId },
          false
        )
      }
    },
    classifyRemembered: (session, target) =>
      pairedEnvironment && target.kind === 'terminal'
        ? pairedOwner()
        : classifyRememberedAiVaultSession(session, target),
    activateRemembered: async (target) => {
      if (target.kind === 'terminal' && prepared?.terminal?.tabId === target.tabId) {
        return !failure
      }
      if (
        pairedEnvironment &&
        target.kind === 'terminal' &&
        !(useAppStore.getState().tabsByWorktree[route.workspaceId] ?? []).some(
          (tab) => tab.id === target.tabId
        )
      ) {
        return false
      }
      captureTarget(target, target.kind === 'terminal')
      return !failure
    },
    ownershipUnverifiable: () => {
      failure = new Error(
        'Orca cannot verify that this remote conversation has exited, so it will not start a second writer.'
      )
    },
    openStructured: async () => null,
    openTerminal: async (session) => {
      if (
        route.executionHostId !== 'local' &&
        (!pairedEnvironment || (await pairedOwner()) !== 'exited')
      ) {
        failure = new Error(
          'Orca cannot verify that this remote conversation has exited, so it will not start a second writer.'
        )
        return null
      }
      const state = useAppStore.getState()
      const restored = await prepareAiVaultSessionForResume(session)
      if (!activateBacklogTaskWorkspace(route)) {
        failure = new Error('The target workspace is no longer available.')
        return null
      }
      const launched = launchAiVaultSessionInNewTab({
        agent: conversation.agent,
        worktreeId: route.workspaceId,
        runtimeEnvironmentId: route.runtimeEnvironmentId,
        ...buildAiVaultResumeStartupForWorktree({
          state,
          worktreeId: route.workspaceId,
          session: { ...restored, executionHostId: session.executionHostId },
          commandOverride: state.settings?.agentCmdOverrides?.[conversation.agent]
        })
      })
      if (launched.tabId === null) {
        const outcome = await launched.runtimeLaunch
        const terminal =
          outcome.status === 'created'
            ? await waitForRestoredBacklogTerminal(
                session,
                route.workspaceId,
                route.runtimeEnvironmentId
              )
            : null
        if (!terminal) {
          failure = new Error('The selected conversation could not be restored.')
          return null
        }
        prepared = terminalConversation(conversation, terminal.tabId, true, terminal)
        return { kind: 'terminal' as const, workspaceId: route.workspaceId, tabId: terminal.tabId }
      }
      const tabId = launched.tabId
      const target = { kind: 'terminal' as const, workspaceId: route.workspaceId, tabId }
      captureTarget(target, true)
      return target
    }
  }
  await openAiVaultSession(historySession, 'terminal', route.workspaceId, openDeps)
  // A concurrent Start awaits the first caller's fenced open. Re-enter after it settles so this
  // caller receives the remembered target instead of inferring that the provider has exited.
  if (!prepared && !failure) {
    await openAiVaultSession(historySession, 'terminal', route.workspaceId, openDeps)
  }
  if (failure) {
    throw failure
  }
  if (!prepared) {
    throw new Error('The selected conversation could not be restored.')
  }
  return prepared
}
