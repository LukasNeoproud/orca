// A local slash command's output (a `<synthetic>` assistant frame carrying `local_command_run`)
// reaches the stream BEFORE the replayed user frame that ran it (measured, Claude Code 2.1.300).
// Journaled in that order, the output opens a turn the command's echo then supersedes: an
// "Interrupted" turn above the command's own bubble. Held until the echo lands, both read in order.

import type { ClaudeStructuredSessionEvent } from './claude-structured-session-state'

type MessageEvent = Extract<ClaudeStructuredSessionEvent, { type: 'message' }>

function isLocalCommandOutput(event: ClaudeStructuredSessionEvent): event is MessageEvent {
  return (
    event.type === 'message' &&
    event.message.type === 'assistant' &&
    typeof event.message.local_command_run === 'object' &&
    event.message.local_command_run !== null &&
    typeof event.message.parent_tool_use_id !== 'string'
  )
}

function isUserReplay(event: ClaudeStructuredSessionEvent): boolean {
  return (
    event.type === 'message' && event.message.type === 'user' && event.message.isReplay === true
  )
}

/** Wraps a translator's `handle` so an idle session's command output follows its command. */
export function orderClaudeLocalCommandOutput(
  handle: (event: ClaudeStructuredSessionEvent) => void,
  isIdle: () => boolean
): (event: ClaudeStructuredSessionEvent) => void {
  let held: MessageEvent | null = null
  return (event) => {
    if (held === null && isIdle() && isLocalCommandOutput(event)) {
      held = event
      return
    }
    const output = held
    held = null
    if (output && !isUserReplay(event)) {
      handle(output)
      handle(event)
      return
    }
    handle(event)
    if (output) {
      handle(output)
    }
  }
}
