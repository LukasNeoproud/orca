import {
  activateBacklogTaskTerminal as activateTerminal,
  activateBacklogTaskStructuredConversation as activateStructured
} from './backlog-task-conversation-activation'
import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import { useAppStore } from '@/store'
import { classifyRememberedAiVaultTerminalOwner } from './ai-vault-session-terminal-owner'
import { getAiVaultSessionWorktreeMap } from '@/components/right-sidebar/ai-vault-session-worktree'
import { getBacklogTaskWorkspaceOptions } from './backlog-task-handoff-options'
import { readBacklogTaskAssociation } from './backlog-task-association-client'
import type { BacklogRoute } from './backlog-rpc'
import { classifyPairedProviderOwner } from './backlog-task-paired-terminal-owner'
import { openBacklogTaskHistory } from './backlog-task-continue-open-history'

export type BacklogTaskContinueResult = {
  association: BacklogTaskAssociation
  status: 'activated' | 'restored' | 'unverifiable' | 'unavailable'
}

export async function continueBacklogTask(
  sourceRoute: BacklogRoute,
  savedAssociation: BacklogTaskAssociation
): Promise<BacklogTaskContinueResult> {
  let association: BacklogTaskAssociation | null
  try {
    association = await readBacklogTaskAssociation(sourceRoute, savedAssociation.taskId)
  } catch {
    return { association: savedAssociation, status: 'unverifiable' }
  }
  if (!association || association.attemptId !== savedAssociation.attemptId) {
    return { association: savedAssociation, status: 'unavailable' }
  }
  const result = (status: BacklogTaskContinueResult['status']): BacklogTaskContinueResult => ({
    association,
    status
  })
  const host = parseExecutionHostId(sourceRoute.executionHostId)
  const hostMatches =
    association.executionHostId === sourceRoute.executionHostId ||
    (host?.kind === 'runtime' && association.executionHostId === 'local')
  if (!hostMatches) {
    return result('unavailable')
  }
  const workspace = getBacklogTaskWorkspaceOptions(sourceRoute).find(
    (row) => row.id === association.targetWorkspace.workspaceId
  )
  if (!workspace) {
    return result('unavailable')
  }
  const route = { ...sourceRoute, workspaceId: workspace.id }
  if (association.session.structuredSessionId) {
    return result(await activateStructured(route, association.session.structuredSessionId))
  }
  const terminal = association.terminal
  const state = useAppStore.getState()
  const paneKey =
    terminal?.paneKey ?? (terminal?.leafId ? `${terminal.tabId}:${terminal.leafId}` : '')
  const currentProvider = state.agentStatusByPaneKey[paneKey]?.providerSession?.id
  const queuedProvider = terminal
    ? state.pendingStartupByTabId[terminal.tabId]?.resumeProviderSession?.id
    : undefined
  const currentPty = terminal?.leafId
    ? state.terminalLayoutsByTabId[terminal.tabId]?.ptyIdsByLeafId?.[terminal.leafId]
    : undefined
  const hintMatches = association.session.providerSession
    ? currentProvider === association.session.providerSession.id ||
      queuedProvider === association.session.providerSession.id
    : Boolean(terminal?.ptyId && currentPty === terminal.ptyId)
  const pairedPtyMatches = sourceRoute.runtimeEnvironmentId
    ? parseRemoteRuntimePtyId(currentPty ?? '')?.environmentId === sourceRoute.runtimeEnvironmentId
    : false
  if (
    (route.executionHostId === 'local' || pairedPtyMatches) &&
    terminal &&
    hintMatches &&
    classifyRememberedAiVaultTerminalOwner(useAppStore.getState(), route.executionHostId, {
      workspaceId: route.workspaceId,
      tabId: terminal.tabId
    }) !== 'exited' &&
    activateTerminal(route, terminal.tabId, terminal.leafId)
  ) {
    return result('activated')
  }
  const providerSession = association.session.providerSession
  if (!providerSession) {
    return result(route.executionHostId === 'local' ? 'unavailable' : 'unverifiable')
  }
  if (host?.kind === 'ssh' && sourceRoute.runtimeEnvironmentId) {
    return result('unverifiable')
  }
  try {
    const history = await window.api.aiVault.listSessions({
      executionHostScope: route.executionHostId,
      scopePaths: [workspace.path],
      unlimited: true,
      force: true
    })
    if (history.cancelled) {
      return result('unverifiable')
    }
    const sessionWorkspaces = getAiVaultSessionWorktreeMap({
      sessions: history.sessions,
      repos: useAppStore.getState().repos,
      worktrees: getBacklogTaskWorkspaceOptions(sourceRoute)
    })
    const session = history.sessions.find(
      (candidate) =>
        candidate.executionHostId === route.executionHostId &&
        candidate.sessionId === providerSession.id &&
        sessionWorkspaces.get(candidate.id)?.worktreeId === route.workspaceId &&
        (!association.session.history?.codexHome ||
          candidate.codexHome === association.session.history.codexHome) &&
        !candidate.subagent &&
        (!terminal?.launchAgent || candidate.agent === terminal.launchAgent)
    )
    if (!session) {
      return result(route.executionHostId === 'local' ? 'unavailable' : 'unverifiable')
    }
    const pairedOwnerClassifier =
      host?.kind === 'runtime' && sourceRoute.runtimeEnvironmentId
        ? () =>
            classifyPairedProviderOwner({
              environmentId: sourceRoute.runtimeEnvironmentId!,
              association,
              agent: session.agent
            })
        : undefined
    return await openBacklogTaskHistory(
      sourceRoute,
      route,
      association,
      session,
      pairedOwnerClassifier
    )
  } catch {
    return result('unverifiable')
  }
}
