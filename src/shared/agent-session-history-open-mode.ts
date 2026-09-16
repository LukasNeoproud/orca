export const DEFAULT_AGENT_SESSION_HISTORY_OPEN_MODE = 'terminal' as const

export type AgentSessionHistoryOpenMode = 'terminal' | 'structured'

export function normalizeAgentSessionHistoryOpenMode(value: unknown): AgentSessionHistoryOpenMode {
  return value === 'structured' ? 'structured' : DEFAULT_AGENT_SESSION_HISTORY_OPEN_MODE
}

export function resolveAgentSessionHistoryOpenMode(
  settings: { agentSessionHistoryOpenMode?: unknown } | null | undefined
): AgentSessionHistoryOpenMode {
  return normalizeAgentSessionHistoryOpenMode(settings?.agentSessionHistoryOpenMode)
}
