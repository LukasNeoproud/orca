import { selectTerminalTabAgentTypesByLeaf } from '../terminal-pane/terminal-tab-agent-type-index'
import type { PaneForegroundAgentEntry } from '../../store/slices/pane-foreground-agent'
import { useEffect } from 'react'
import { useAppStore } from '../../store'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import { resolveNativeChatTabAgentEvidence } from '../tab-bar/native-chat-tab-agent-evidence'
import { canSwitchNativeChatView } from './native-chat-availability'
import { isNativeChatTranscriptLocalReadable } from '@/lib/native-chat-transcript-readability'
import { isMacPlatform, matchesNativeChatToggleShortcut } from './native-chat-shortcut'
import { getConnectionIdFromState } from '@/lib/connection-context'
import {
  isNativeChatTabWideFallbackSafe,
  resolveNativeChatActiveLayoutLeafId
} from './native-chat-leaf-routing'

export function resolveNativeChatToggleShortcutDetectedAgent({
  terminalTabId,
  terminalLayout,
  agentStatusByPaneKey,
  paneForegroundAgentByPaneKey
}: {
  terminalTabId: string
  terminalLayout?: TerminalLayoutSnapshot | null
  agentStatusByPaneKey: Record<string, { agentType?: AgentType }>
  paneForegroundAgentByPaneKey?: Record<string, PaneForegroundAgentEntry>
}): AgentType | null {
  const byLeaf = selectTerminalTabAgentTypesByLeaf(
    agentStatusByPaneKey,
    terminalTabId,
    paneForegroundAgentByPaneKey
  )
  const activeLeafId = resolveNativeChatActiveLayoutLeafId(terminalLayout)
  if (activeLeafId) {
    return byLeaf[activeLeafId] ?? null
  }
  if (!isNativeChatTabWideFallbackSafe(terminalLayout)) {
    return null
  }
  return Object.values(byLeaf)[0] ?? null
}

/** Toggles the active worktree's focused agent-terminal tab between the terminal
 *  and native chat views via the keyboard. Gated to the active worktree so only
 *  one listener acts at a time, and to agent terminals so the chord is inert on
 *  plain shells / non-terminal surfaces. */
export function useNativeChatToggleShortcut(worktreeId: string, isWorktreeActive: boolean): void {
  useEffect(() => {
    if (!isWorktreeActive) {
      return
    }
    const isMac = isMacPlatform()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || !matchesNativeChatToggleShortcut(e, isMac)) {
        return
      }
      const state = useAppStore.getState()
      const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
      const group = (state.groupsByWorktree[worktreeId] ?? []).find((g) => g.id === activeGroupId)
      if (!group?.activeTabId) {
        return
      }
      const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === group.activeTabId
      )
      // Standalone structured tabs have no original terminal surface.
      if (!tab || tab.contentType !== 'terminal') {
        return
      }
      const terminalTab = (state.tabsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === tab.entityId
      )
      // Carry the agent identity (not just "an agent exists") so the chord stays
      // inert on unsupported agents (e.g. Gemini), matching the menu/header gate.
      // Pane keys are `${entityId}:${leafId}` — the backing terminal tab id, not
      // the unified tab id.
      const terminalLayout = state.terminalLayoutsByTabId[tab.entityId]
      const tabWideFallbackSafe = isNativeChatTabWideFallbackSafe(terminalLayout)
      const detectedAgent = resolveNativeChatToggleShortcutDetectedAgent({
        terminalTabId: tab.entityId,
        terminalLayout,
        agentStatusByPaneKey: state.agentStatusByPaneKey,
        paneForegroundAgentByPaneKey: state.paneForegroundAgentByPaneKey
      })
      const titleFallbackAgent =
        tabWideFallbackSafe && terminalTab
          ? resolveNativeChatTabAgentEvidence(terminalTab, tab)
          : null
      if (
        !canSwitchNativeChatView({
          experimentalNativeChatEnabled: state.settings?.experimentalNativeChat === true,
          contentType: 'terminal',
          launchAgent: detectedAgent || !tabWideFallbackSafe ? null : terminalTab?.launchAgent,
          detectedAgent,
          resolvedAgent: detectedAgent ? null : titleFallbackAgent,
          nativeChatTranscriptIsLocalReadable: isNativeChatTranscriptLocalReadable(
            getConnectionIdFromState(state, worktreeId)
          ),
          isChatViewMode: tab.viewMode === 'chat',
          structuredSessionId: tab.structuredSessionId,
          structuredSessionPaneKey: tab.structuredSessionPaneKey,
          activePaneKey: (() => {
            const leaf = resolveNativeChatActiveLayoutLeafId(terminalLayout)
            return leaf ? `${tab.entityId}:${leaf}` : null
          })()
        })
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      state.toggleTabViewMode(tab.id)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [worktreeId, isWorktreeActive])
}
