import { ORCA_INTERACTION_MCP_SERVER } from '../../shared/orca-interaction-elicitation'
import { readString } from './codex-item-field-readers'
import type { CodexThreadItem } from './codex-thread-item-identity'

export function summarizeCodexInteractionResult(text: string): string {
  try {
    const result = JSON.parse(text) as { status?: unknown }
    return result.status === 'cancelled'
      ? 'Interaction cancelled'
      : result.status === 'submitted'
        ? 'Response submitted'
        : 'Interaction completed'
  } catch {
    return 'Interaction completed'
  }
}

// Completed Orca interactions show a short status instead of the raw structured answer.
export function codexMcpToolOutputText(
  item: CodexThreadItem,
  failure: string | null,
  text: string | null
): string | null {
  return readString(item, 'server') === ORCA_INTERACTION_MCP_SERVER &&
    readString(item, 'tool') === 'interact' &&
    failure === null &&
    readString(item, 'status') === 'completed' &&
    text !== null
    ? summarizeCodexInteractionResult(text)
    : text
}
