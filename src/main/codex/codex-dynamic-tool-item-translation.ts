import type { AgentJournalToolCallItem } from '../../shared/agent-session-journal-types'
import { toolExecutionMetadata } from '../../shared/native-chat-tool-identity'
import {
  boundInlineText,
  boundToolInput,
  DEFAULT_JOURNAL_PAYLOAD_LIMITS
} from '../native-chat/agent-session-journal/journal-payload-bounds'
import { readString, readTextContent } from './codex-item-field-readers'
import { summarizeCodexInteractionResult } from './codex-interaction-result-summary'
import type { CodexThreadItem } from './codex-thread-item-identity'

function dynamicToolArguments(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value === null || value === undefined ? null : { arguments: value }
  }
  return Array.isArray(value) ? { arguments: value } : Object.keys(value).length > 0 ? value : null
}

export function codexDynamicToolCallBody(item: CodexThreadItem): AgentJournalToolCallItem {
  const namespace = readString(item, 'namespace')
  const tool = readString(item, 'tool')
  const status = readString(item, 'status')
  const text = readTextContent({ content: item.contentItems }, 'content')
  let output = text
  if (
    namespace === 'orca' &&
    tool === 'interact' &&
    status === 'completed' &&
    item.success !== false &&
    text !== null
  ) {
    output = summarizeCodexInteractionResult(text)
  }
  const bounded = output === null ? null : boundInlineText(output, DEFAULT_JOURNAL_PAYLOAD_LIMITS)
  return {
    kind: 'tool-call',
    name: tool === null ? 'dynamic tool' : namespace === null ? tool : `${namespace}.${tool}`,
    input: boundToolInput(dynamicToolArguments(item.arguments), DEFAULT_JOURNAL_PAYLOAD_LIMITS),
    state:
      item.success === false || status === 'failed'
        ? 'failed'
        : status === 'completed'
          ? 'completed'
          : 'running',
    ...toolExecutionMetadata(item),
    ...(bounded === null ? {} : { output: bounded.bounded })
  }
}
