import type { CodexJournalItems } from './codex-structured-journal-items'
import type { CodexJournalGenericFrames } from './codex-structured-journal-generic-frames'
import type { CodexJournalActiveTurns } from './codex-structured-journal-translation-turn-state'
import type { CodexStructuredGenerationMetrics } from './codex-structured-generation-metrics'
import type { CodexStructuredSessionEvent } from './codex-structured-session-adapter'
import {
  CODEX_JOURNAL_ADMITTED,
  type CodexJournalTranslationAdmission,
  type CodexJournalTranslatorDeps
} from './codex-structured-journal-contracts'
import { publishCodexTurnLifecycle } from './codex-structured-journal-translation-turns'
import { settleCodexJournalTurn } from './codex-structured-journal-settlement'
import { readCodexTurnId } from './codex-structured-thread-facts'
import { readCodexJournalRecord } from './codex-structured-journal-translation-values'

export function createCodexJournalTurnLifecycle({
  deps,
  items,
  activeTurns,
  genericFrames,
  generation,
  resetActivity
}: {
  deps: CodexJournalTranslatorDeps
  items: CodexJournalItems
  activeTurns: CodexJournalActiveTurns
  genericFrames: CodexJournalGenericFrames
  generation: CodexStructuredGenerationMetrics
  resetActivity: () => void
}) {
  return { startTurn, completeTurn }

  function startTurn(
    event: Extract<CodexStructuredSessionEvent, { type: 'notification' }>
  ): CodexJournalTranslationAdmission {
    const turnId = readCodexTurnId(event.params)
    if (!turnId) {
      return CODEX_JOURNAL_ADMITTED
    }
    if (!activeTurns.canRemember(event.threadId, turnId)) {
      return { accepted: false, reason: 'backpressure' }
    }
    const admission = publishCodexTurnLifecycle({
      sink: deps.sink,
      primaryThreadId: deps.primaryThreadId?.() ?? null,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId,
      state: 'running'
    })
    if (admission.accepted) {
      activeTurns.remember(event.threadId, turnId)
      if (event.threadId === (deps.primaryThreadId?.() ?? null)) {
        generation.start(turnId)
        resetActivity()
      }
    }
    return admission
  }

  function completeTurn(event: {
    sessionId: string
    threadId: string
    params: unknown
  }): CodexJournalTranslationAdmission {
    const suppressionAdmission = genericFrames.flush()
    if (!suppressionAdmission.accepted) {
      return suppressionAdmission
    }
    const turnId = readCodexTurnId(event.params) ?? activeTurns.current(event.threadId)
    if (!turnId) {
      return CODEX_JOURNAL_ADMITTED
    }
    // The roster is deliberately NOT swept here. `spawn_agent` children outlive
    // the turn that spawned them and go on reporting into the same group, so a
    // turn boundary is no evidence contact was lost — and `turn/completed` is
    // the only turn-end notification Codex sends, so an abort cannot be told
    // apart from a clean finish either. Only `settleSession` may write
    // `unverifiable`.
    const generationUpdate =
      event.threadId === (deps.primaryThreadId?.() ?? null)
        ? generation.complete(turnId, turnCompletedSuccessfully(event.params))
        : null
    if (generationUpdate) {
      const generationAdmission = items.appendGeneration(
        event.threadId,
        generationUpdate.itemId,
        generationUpdate.generation
      )
      if (!generationAdmission.accepted) {
        return generationAdmission
      }
    }
    const admission = settleCodexJournalTurn({
      sink: deps.sink,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId,
      streams: items.streams,
      activeItems: items.activeItems
    })
    if (admission.accepted) {
      if (event.threadId === (deps.primaryThreadId?.() ?? null)) {
        generation.settle(turnId)
      }
      items.ordinals.forgetTurn(event.threadId, turnId)
      activeTurns.forget(event.threadId, turnId)
      if (event.threadId === (deps.primaryThreadId?.() ?? null)) {
        resetActivity()
      }
    }
    return admission
  }
}

function turnCompletedSuccessfully(params: unknown): boolean {
  return readCodexJournalRecord(readCodexJournalRecord(params).turn).status === 'completed'
}
