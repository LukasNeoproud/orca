import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { AppState } from '@/store/types'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { LOCAL_EXECUTION_HOST_ID, parseExecutionHostId } from '../../../shared/execution-host'
import { collectLeafIds } from '@/components/terminal-pane/terminal-pane-layout-tree'

export type AiVaultQueuedTerminalTarget = { workspaceId: string; tabId: string }
export type AiVaultRememberedTerminalOwnerState = 'live' | 'unverifiable' | 'exited'

/** Finds a resume whose command was queued or claimed but whose provider hook has not arrived. */
export function findQueuedAiVaultSessionTerminal(
  state: AppState,
  session: Pick<AiVaultSession, 'agent' | 'executionHostId' | 'sessionId'>
): AiVaultQueuedTerminalTarget | null {
  for (const [tabId, startup] of Object.entries(state.pendingStartupByTabId)) {
    const workspaceId = findTerminalTabWorkspaceId(state.tabsByWorktree, tabId)
    if (
      workspaceId &&
      getExecutionHostIdForWorktree(state, workspaceId) === session.executionHostId &&
      startup.launchAgent === session.agent &&
      startup.resumeProviderSession?.id === session.sessionId
    ) {
      return { workspaceId, tabId }
    }
  }
  for (const [tabId, claim] of Object.entries(state.automaticAgentResumeClaimsByTabId)) {
    if (
      claim.launchAgent === session.agent &&
      claim.providerSession.id === session.sessionId &&
      getExecutionHostIdForWorktree(state, claim.worktreeId) === session.executionHostId &&
      (state.tabsByWorktree[claim.worktreeId] ?? []).some((tab) => tab.id === tabId)
    ) {
      return { workspaceId: claim.worktreeId, tabId }
    }
  }
  return null
}

/** Uses only host-owned process evidence; missing remote rows never prove exit. */
export function classifyRememberedAiVaultTerminalOwner(
  state: Pick<
    AppState,
    | 'paneForegroundAgentByPaneKey'
    | 'sshConnectionStates'
    | 'tabsByWorktree'
    | 'terminalLayoutsByTabId'
  >,
  executionHostId: AiVaultSession['executionHostId'],
  target: AiVaultQueuedTerminalTarget
): AiVaultRememberedTerminalOwnerState {
  const parsedHost = parseExecutionHostId(executionHostId)
  if (
    parsedHost?.kind === 'runtime' ||
    (parsedHost?.kind === 'ssh' &&
      state.sshConnectionStates.get(parsedHost.targetId)?.status !== 'connected')
  ) {
    return 'unverifiable'
  }
  const leafIds = collectLeafIds(state.terminalLayoutsByTabId[target.tabId]?.root)
  const shellReturned =
    leafIds.length > 0 &&
    leafIds.every(
      (leafId) =>
        state.paneForegroundAgentByPaneKey[`${target.tabId}:${leafId}`]?.shellForeground === true
    )
  if (shellReturned) {
    return 'exited'
  }
  if (executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return 'unverifiable'
  }
  const tabExists = (state.tabsByWorktree[target.workspaceId] ?? []).some(
    (tab) => tab.id === target.tabId
  )
  return tabExists ? 'unverifiable' : 'exited'
}

function findTerminalTabWorkspaceId(
  tabsByWorktree: AppState['tabsByWorktree'],
  tabId: string
): string | null {
  for (const [workspaceId, tabs] of Object.entries(tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return workspaceId
    }
  }
  return null
}
