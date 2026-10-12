import type { CodexJournalTranslationAdmission } from './codex-structured-journal-contracts'
import type { CodexSession, CodexStructuredSessionEvent } from './codex-structured-session-state'
import { readCodexTurnId } from './codex-structured-thread-facts'

type CodexInteractionSettlements = ReturnType<CodexSession['prompts']['interactionSettlements']>

// A resolved MCP elicitation or an ended turn leaves its Orca interaction form unanswerable.
function codexInteractionSettlements(
  session: CodexSession,
  event: CodexStructuredSessionEvent
): CodexInteractionSettlements {
  if (event.type !== 'notification') {
    return []
  }
  if (event.method === 'serverRequest/resolved') {
    const requestId =
      typeof event.params === 'object' && event.params !== null
        ? (event.params as Record<string, unknown>).requestId
        : null
    return typeof requestId === 'string' || typeof requestId === 'number'
      ? session.prompts.interactionSettlements({ requestId })
      : []
  }
  const turnId = event.method === 'turn/completed' ? readCodexTurnId(event.params) : null
  return turnId ? session.prompts.interactionSettlements({ threadId: event.threadId, turnId }) : []
}

/** Cancels settled forms ahead of the frame; a refusal is retried together with that frame. */
export function translateCodexEventSettlingInteractions(
  session: CodexSession,
  event: CodexStructuredSessionEvent
): CodexJournalTranslationAdmission {
  const settlements = codexInteractionSettlements(session, event)
  for (const { journalItemIds } of settlements) {
    for (const itemId of journalItemIds) {
      const cancelled = session.translator?.cancelPrompt(itemId) ?? { accepted: true }
      if (!cancelled.accepted) {
        return cancelled
      }
    }
  }
  const admission = session.translator?.handle(event) ?? { accepted: true }
  if (admission.accepted) {
    for (const { prompt } of settlements) {
      session.prompts.forget(prompt)
    }
  }
  return admission
}
