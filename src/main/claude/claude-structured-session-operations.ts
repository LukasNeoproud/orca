import type { AgentSessionBackgroundTaskState } from '../../shared/agent-session-wire'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredSessionCompaction } from '../native-chat/agent-session-wire/structured-session-compaction'
import { cancelClaudeTurn, stopClaudeBackgroundTasks } from './claude-structured-control-actions'
import type {
  ClaudeAcquisitionAttempt,
  ClaudeSession,
  ClaudeSessionExit
} from './claude-structured-session-state'

export function claudeBackgroundTaskState(
  session: ClaudeSession
): AgentSessionBackgroundTaskState | null {
  const state = session.backgroundTasks.state
  return state ? { ...state, supportsTaskStop: true } : null
}

export function cancelClaudeStructuredAdapterTurn(input: {
  request: Parameters<StructuredAgentSessionAdapter['cancelTurn']>[0]
  session: ClaudeSession
  sessions: Map<string, ClaudeSession>
  compactions: StructuredSessionCompaction
  requestTimeoutMs?: number
}) {
  const generation = input.session.acquisitionGeneration
  return cancelClaudeTurn(input.session, input.requestTimeoutMs, () => {
    return (
      input.sessions.get(input.request.sessionId) === input.session &&
      input.session.fence === input.request.fence &&
      input.session.acquisitionGeneration === generation &&
      (input.compactions.ownsTurn(input.request.sessionId, input.request.turnId) ||
        (input.session.activeTurnId === undefined
          ? input.session.dispatchSequence === 0
          : input.session.activeTurnId === input.request.turnId &&
            input.session.activeTurnSequence === input.session.dispatchSequence))
    )
  })
}

export function stopClaudeStructuredAdapterTasks(input: {
  request: Parameters<NonNullable<StructuredAgentSessionAdapter['stopBackgroundTasks']>>[0]
  session: ClaudeSession
  sessions: Map<string, ClaudeSession>
  requestTimeoutMs?: number
}) {
  const generation = input.session.acquisitionGeneration
  return stopClaudeBackgroundTasks(
    input.session,
    input.requestTimeoutMs,
    () =>
      Boolean(
        input.sessions.get(input.request.sessionId) === input.session &&
        input.session.fence === input.request.fence &&
        input.session.acquisitionGeneration === generation &&
        input.session.backgroundTasks.state
      ),
    input.request.taskId
  )
}

export function observeClaudeStructuredSessionExit(input: {
  sessionId: string
  attempt: ClaudeAcquisitionAttempt
  error: Error
  sessions: Map<string, ClaudeSession>
  exits: Map<string, ClaudeSessionExit>
  settle: (sessionId: string, exit: ClaudeSessionExit) => Promise<void>
}): void {
  const session = input.sessions.get(input.sessionId)
  if (!session || session.connection !== input.attempt.connection) {
    return
  }
  input.sessions.delete(input.sessionId)
  const closePromise = session.connection.close().catch(() => false)
  const exit: ClaudeSessionExit = {
    connection: session.connection,
    session,
    error: input.error,
    closePromise
  }
  input.exits.set(input.sessionId, exit)
  exit.publication = closePromise
    .then((proven) => (proven ? input.settle(input.sessionId, exit) : undefined))
    .catch(() => undefined)
}

export async function drainClaudeStructuredSessionExits(
  exits: ReadonlyMap<string, ClaudeSessionExit>
): Promise<void> {
  const awaited = new Set<Promise<void>>()
  for (;;) {
    const pending = [...exits.values()]
      .map((exit) => exit.publication)
      .filter(
        (publication): publication is Promise<void> =>
          publication !== undefined && !awaited.has(publication)
      )
    if (pending.length === 0) {
      return
    }
    for (const publication of pending) {
      awaited.add(publication)
    }
    await Promise.all(pending)
  }
}
