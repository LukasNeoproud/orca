import { translate } from '@/i18n/i18n'
import type { AgentCatalogEntry } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../shared/tui-agent'

/** Agents that would open a native chat here, offered a second "in the terminal" row. */
export type AgentPickerTerminalVariant = {
  agents: ReadonlySet<TuiAgent>
  inTerminal: boolean
  onSelect: (agent: TuiAgent, inTerminal: boolean) => void
}

export type AgentPickerRow = {
  itemValue: string
  agent: AgentCatalogEntry
  /** Null for an agent with a single row. */
  inTerminal: boolean | null
}

const TERMINAL_ITEM_SUFFIX = ':terminal'

export function buildAgentPickerRows(
  agents: readonly AgentCatalogEntry[],
  variant?: AgentPickerTerminalVariant
): AgentPickerRow[] {
  return agents.flatMap((agent): AgentPickerRow[] =>
    variant?.agents.has(agent.id)
      ? [
          { itemValue: agent.id, agent, inTerminal: false },
          { itemValue: `${agent.id}${TERMINAL_ITEM_SUFFIX}`, agent, inTerminal: true }
        ]
      : [{ itemValue: agent.id, agent, inTerminal: null }]
  )
}

export function agentPickerCommandValue(
  agent: TuiAgent | null,
  variant?: AgentPickerTerminalVariant
): string | null {
  return agent && variant?.inTerminal && variant.agents.has(agent)
    ? `${agent}${TERMINAL_ITEM_SUFFIX}`
    : agent
}

export function agentPickerRowLabel(label: string, inTerminal: boolean | null): string {
  if (inTerminal === null) {
    return label
  }
  return inTerminal
    ? translate('agentPicker.terminalVariant', '{{agent}} (Terminal)', { agent: label })
    : translate('agentPicker.chatVariant', '{{agent}} (Chat)', { agent: label })
}
