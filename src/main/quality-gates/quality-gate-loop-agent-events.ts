import type { AgentStatusState } from '../../shared/agent-status-types'
import { structuredAgentSessionTabId } from '../../shared/structured-agent-session-projection'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import type { QualityGateLoopAgentEvent } from './quality-gate-feedback-loop'

const STRUCTURED_TAB_PREFIX = structuredAgentSessionTabId('')

type Seen = { state: AgentStatusState; turnStartedAt: number | undefined }

/**
 * Reads the hook server's status events as the three things the feedback loop reacts to: a step
 * ended, a turn began, a turn was interrupted. It remembers only the last state of each pane, to
 * tell a change from a repeat; the status itself stays in the hook server's store.
 *
 * Why the combined `state` and not the main agent's own: a lead that finished while a subagent
 * still edits files has not finished the step, and a subagent finishing never moves the row to
 * `done` while the lead works.
 */
export function createQualityGateLoopAgentEvents() {
  const seen = new Map<string, Seen>()

  return {
    observe(enriched: EnrichedAgentHookEventPayload): QualityGateLoopAgentEvent | null {
      // Stored or replayed evidence describes an earlier runtime; only a live event is a step.
      if (enriched.isReplay || enriched.providerSessionOnly || enriched.restoredUnconfirmed) {
        return null
      }
      const { paneKey, payload } = enriched
      const previous = seen.get(paneKey)
      seen.set(paneKey, { state: payload.state, turnStartedAt: enriched.turnStartedAt })
      const worktreeId = enriched.worktreeId
      if (!worktreeId) {
        return null
      }
      if (payload.state === 'working') {
        // A stamp that appears on a turn already seen working only dates that turn.
        const restamped =
          enriched.turnStartedAt !== undefined &&
          previous?.turnStartedAt !== undefined &&
          enriched.turnStartedAt !== previous.turnStartedAt
        if (!restamped && previous?.state !== 'done') {
          return null
        }
        return { type: 'turn-started', worktreeId, paneKey, prompt: payload.prompt }
      }
      // A session start lands on `done` without a turn; so does a row first seen already done.
      if (
        payload.state !== 'done' ||
        payload.sessionBoundary ||
        !previous ||
        previous.state === 'done'
      ) {
        return null
      }
      const outcome = payload.mainAgent?.outcome
      if (payload.interrupted || (outcome !== undefined && outcome !== 'success')) {
        return { type: 'interrupted', worktreeId, paneKey }
      }
      const structured =
        enriched.structuredHost && enriched.tabId?.startsWith(STRUCTURED_TAB_PREFIX)
          ? enriched.tabId.slice(STRUCTURED_TAB_PREFIX.length)
          : undefined
      const turnStartedAt = enriched.turnStartedAt ?? previous.turnStartedAt
      return {
        type: 'step-completed',
        worktreeId,
        agent: {
          paneKey,
          agentType: payload.agentType,
          ...(structured ? { structuredSessionId: structured } : {}),
          ...(enriched.terminalHandle ? { terminalHandle: enriched.terminalHandle } : {}),
          ...(turnStartedAt !== undefined ? { turnStartedAt } : {}),
          completedAt: enriched.receivedAt
        }
      }
    },

    forget(paneKey: string): QualityGateLoopAgentEvent {
      seen.delete(paneKey)
      return { type: 'agent-gone', paneKey }
    }
  }
}
