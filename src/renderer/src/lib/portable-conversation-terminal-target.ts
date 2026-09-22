import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import { parseAppSshPtyId } from '../../../shared/ssh-pty-id'

export function findPortableConversationTerminalTarget(
  target: RuntimeClientTarget,
  source: PortableConversationSource
) {
  const state = useAppStore.getState()
  for (const [paneKey, status] of Object.entries(state.agentStatusByPaneKey)) {
    if (
      status?.providerSession?.id !== source.provider.sessionId ||
      status.agentType !== source.provider.agent ||
      status.worktreeId !== source.workspace.id
    ) {
      continue
    }
    if (
      status.providerSession.transcriptPath &&
      status.providerSession.transcriptPath !== source.transcriptPath
    ) {
      continue
    }
    const pane = parsePaneKey(paneKey)
    if (
      !pane ||
      !(state.tabsByWorktree[source.workspace.id] ?? []).some((tab) => tab.id === pane.tabId)
    ) {
      continue
    }
    const pty = state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
    if (!pty) {
      continue
    }
    const paired = parseRemoteRuntimePtyId(pty)
    if (target.kind === 'environment') {
      if (paired?.environmentId !== target.environmentId) {
        continue
      }
    } else if (paired || parseAppSshPtyId(pty)?.connectionId !== source.executionHostId.slice(4)) {
      continue
    }
    return { tabId: pane.tabId, leafId: pane.leafId }
  }
  return null
}
