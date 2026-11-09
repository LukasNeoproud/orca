import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import type { PaneForegroundAgentEntry } from '../../store/slices/pane-foreground-agent'

export type PaneAgentSessionIdState = {
  agentStatusByPaneKey: Record<string, AgentStatusEntry | undefined>
  sleepingAgentSessionsByPaneKey: Record<string, SleepingAgentSessionRecord | undefined>
  paneForegroundAgentByPaneKey: Record<string, PaneForegroundAgentEntry | undefined>
}

/** Resolves the provider session owned by one exact terminal pane, while its agent is still live. */
export function resolvePaneAgentSessionId(
  state: PaneAgentSessionIdState,
  paneKey: string
): string | null {
  // OSC 133;D proves the pane is back at the shell. The durable record outlives that exit on
  // purpose (cold restore resumes from it), so gate it here too — otherwise the gate would only
  // hold for panes whose agent has no resumable record.
  if (state.paneForegroundAgentByPaneKey[paneKey]?.shellForeground === true) {
    return null
  }
  const live = state.agentStatusByPaneKey[paneKey]
  if (live && live.restoredUnconfirmed !== true) {
    return live.providerSession?.id ?? null
  }
  return state.sleepingAgentSessionsByPaneKey[paneKey]?.providerSession.id ?? null
}

/** The pane's conversation id when its agent is Claude, for actions only Claude supports. */
export function resolvePaneClaudeSessionId(
  state: PaneAgentSessionIdState,
  paneKey: string
): string | null {
  const agent =
    state.agentStatusByPaneKey[paneKey]?.agentType ??
    state.sleepingAgentSessionsByPaneKey[paneKey]?.agent
  return agent === 'claude' ? resolvePaneAgentSessionId(state, paneKey) : null
}
