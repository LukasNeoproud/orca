// Only a `warning` frame (a UserPromptSubmit hook that blocked the prompt, say) earns a row, in its
// own words; `info`, `notice` (a hook's systemMessage) and `suggestion` are session chrome, not chat rows.

import type { AgentJournalStatusItem } from '../../shared/agent-session-journal-types'
import {
  boundInlineText,
  DEFAULT_JOURNAL_PAYLOAD_LIMITS
} from '../native-chat/agent-session-journal/journal-payload-bounds'
import { claudeText } from './claude-structured-item-translation'

export const CLAUDE_INFORMATIONAL_FRAME_KIND = 'message:system:informational'

/** The row a warning-level note writes; null for every other level and for a warning with no words. */
export function claudeInformationalRowBody(
  message: Record<string, unknown>
): AgentJournalStatusItem | null {
  const text = message.level === 'warning' ? claudeText(message.content)?.trim() : null
  return text
    ? {
        kind: 'status',
        tone: 'warning',
        text: boundInlineText(text, DEFAULT_JOURNAL_PAYLOAD_LIMITS).text
      }
    : null
}

export const CLAUDE_COMPACT_BOUNDARY_FRAME_KIND = 'message:system:compact_boundary'

/**
 * The row an automatic compaction writes. A `/compact` the user sent reports itself through its
 * own turn's end, so only the CLI's own trigger is said here; without it the summary replaces the
 * history with nothing in the chat to show for it.
 */
export function claudeAutoCompactionRowBody(
  message: Record<string, unknown>
): AgentJournalStatusItem | null {
  const metadata = message.compact_metadata
  const trigger =
    typeof metadata === 'object' && metadata !== null && 'trigger' in metadata
      ? metadata.trigger
      : null
  return trigger === 'auto'
    ? { kind: 'status', text: 'Context compacted', presentation: 'compaction' }
    : null
}
