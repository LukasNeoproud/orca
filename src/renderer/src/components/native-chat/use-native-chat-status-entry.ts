import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { selectTerminalTabAgentTypesByLeaf } from '../terminal-pane/terminal-tab-agent-type-index'
import { findTabAgentEntry } from './native-chat-tab-agent-entry'

export function useNativeChatStatusEntry(
  terminalTabId: string,
  preferredPaneKey: string | undefined
) {
  return useAppStore(
    useShallow((state) => {
      const entry = preferredPaneKey
        ? state.agentStatusByPaneKey[preferredPaneKey]
        : findTabAgentEntry(state.agentStatusByPaneKey, terminalTabId)
      const byLeaf = selectTerminalTabAgentTypesByLeaf(
        state.agentStatusByPaneKey,
        terminalTabId,
        state.paneForegroundAgentByPaneKey
      )
      const leaves = Object.keys(byLeaf)
      const paneKey =
        preferredPaneKey ??
        entry?.paneKey ??
        (leaves.length === 1 ? `${terminalTabId}:${leaves[0]}` : `${terminalTabId}:`)
      return {
        entry,
        paneKey,
        detectedAgent: byLeaf[paneKey.slice(terminalTabId.length + 1)] ?? null
      }
    })
  )
}
