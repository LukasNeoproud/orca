import { isResumableTuiAgent } from '../../../shared/agent-session-resume'
import type { BacklogTaskAssociationTerminal } from '../../../shared/backlog-task-association'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { findQueuedAiVaultSessionTerminal } from './ai-vault-session-terminal-owner'
import { useAppStore } from '@/store'

function findRestoredTerminal(
  session: AiVaultSession,
  workspaceId: string,
  runtimeEnvironmentId: string | null
): BacklogTaskAssociationTerminal | null {
  const state = useAppStore.getState()
  const queued = findQueuedAiVaultSessionTerminal(state, session)
  let tabId = queued?.workspaceId === workspaceId ? queued.tabId : null
  if (tabId && runtimeEnvironmentId) {
    const queuedLeaf = state.terminalLayoutsByTabId[tabId]?.activeLeafId
    const queuedPty = queuedLeaf
      ? state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[queuedLeaf]
      : undefined
    if (queuedPty && parseRemoteRuntimePtyId(queuedPty)?.environmentId !== runtimeEnvironmentId) {
      tabId = null
    }
  }
  let leafId: string | undefined
  if (!tabId) {
    for (const [paneKey, status] of Object.entries(state.agentStatusByPaneKey)) {
      if (
        status?.providerSession?.id !== session.sessionId ||
        status.agentType !== session.agent ||
        status.worktreeId !== workspaceId
      ) {
        continue
      }
      const pane = parsePaneKey(paneKey)
      const ptyId = pane
        ? state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
        : undefined
      const owner = ptyId ? parseRemoteRuntimePtyId(ptyId)?.environmentId : null
      if (pane && (!runtimeEnvironmentId || owner === runtimeEnvironmentId)) {
        tabId = pane.tabId
        leafId = pane.leafId
        break
      }
    }
  }
  if (!tabId || !(state.tabsByWorktree[workspaceId] ?? []).some((tab) => tab.id === tabId)) {
    return null
  }
  leafId ??= state.terminalLayoutsByTabId[tabId]?.activeLeafId ?? undefined
  const paneKey = leafId ? `${tabId}:${leafId}` : undefined
  const ptyId = leafId ? state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[leafId] : undefined
  return {
    tabId,
    ...(leafId ? { leafId } : {}),
    ...(paneKey ? { paneKey } : {}),
    ...(ptyId ? { ptyId } : {}),
    ...(isResumableTuiAgent(session.agent) ? { launchAgent: session.agent } : {})
  }
}

export async function waitForRestoredBacklogTerminal(
  session: AiVaultSession,
  workspaceId: string,
  runtimeEnvironmentId: string | null,
  timeoutMs = 10_000
): Promise<BacklogTaskAssociationTerminal | null> {
  const current = findRestoredTerminal(session, workspaceId, runtimeEnvironmentId)
  if (current) {
    return current
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs)
    const unsubscribe = useAppStore.subscribe(() => {
      const terminal = findRestoredTerminal(session, workspaceId, runtimeEnvironmentId)
      if (terminal) {
        finish(terminal)
      }
    })
    const finish = (terminal: BacklogTaskAssociationTerminal | null): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve(terminal)
    }
  })
}
