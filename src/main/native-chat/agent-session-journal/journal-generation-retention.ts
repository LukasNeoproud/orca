import type { AgentJournalItemBody } from '../../../shared/agent-session-journal-types'

export function retainJournalGeneration(
  previous: AgentJournalItemBody | undefined,
  next: AgentJournalItemBody
): AgentJournalItemBody {
  // Provider history restores prose but cannot reconstruct our captured stream clock.
  if (
    previous?.kind === 'message' &&
    next.kind === 'message' &&
    previous.role === 'assistant' &&
    next.role === 'assistant' &&
    previous.generation &&
    !next.generation &&
    JSON.stringify(previous.blocks) === JSON.stringify(next.blocks)
  ) {
    return { ...next, generation: previous.generation }
  }
  return next
}
