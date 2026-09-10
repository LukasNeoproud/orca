import type { AppState } from '@/store/types'
import type { StructuredTerminalAdoptionInput } from './adopt-structured-agent-terminal'
import type { StructuredAgentSessionTerminalAdoptionResult } from '../../../shared/structured-agent-session-terminal-adoption'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { getExecutionHostIdForWorktree } from './worktree-runtime-owner'

/** Apply only while the same pane still requests chat; late replies cannot reopen closed tabs. */
export function bindStructuredAgentTerminal(
  state: AppState,
  input: StructuredTerminalAdoptionInput & { unifiedTabId: string },
  adopted: StructuredAgentSessionTerminalAdoptionResult
): Partial<AppState> | null {
  const { worktreeId, terminal } = input
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const tab = tabs.find((candidate) => candidate.id === input.unifiedTabId)
  const pane = parsePaneKey(terminal.paneKey)
  const layout = state.terminalLayoutsByTabId[terminal.tabId]
  if (
    state.settings?.experimentalNativeChat !== true ||
    state.settings.experimentalStructuredNativeChat !== true ||
    getExecutionHostIdForWorktree(state, worktreeId) !== 'local' ||
    !tab ||
    tab.contentType !== 'terminal' ||
    tab.entityId !== terminal.tabId ||
    tab.viewMode !== 'chat' ||
    tab.structuredSessionId ||
    adopted.agent !== input.agent ||
    !pane ||
    pane.tabId !== terminal.tabId ||
    layout?.root?.type !== 'leaf' ||
    layout.root.leafId !== pane.leafId ||
    !state.ptyIdsByTabId[terminal.tabId]?.includes(terminal.ptyId) ||
    (layout.ptyIdsByLeafId?.[pane.leafId] && layout.ptyIdsByLeafId[pane.leafId] !== terminal.ptyId)
  ) {
    return null
  }
  return {
    unifiedTabsByWorktree: {
      ...state.unifiedTabsByWorktree,
      [worktreeId]: tabs.map((candidate) =>
        candidate === tab
          ? {
              ...candidate,
              structuredSessionId: adopted.sessionId,
              structuredSessionPaneKey: terminal.paneKey,
              agentSessionAgent: adopted.agent
            }
          : candidate
      )
    }
  }
}
