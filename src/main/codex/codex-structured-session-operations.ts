import type {
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAdapter,
  StructuredAgentSessionSetOptionInput
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredSessionCompaction } from '../native-chat/agent-session-wire/structured-session-compaction'
import { isCodexAppServerRequestError } from './codex-app-server-connection'
import { applyCodexStructuredSessionOption } from './codex-structured-session-options'
import type { CodexSession } from './codex-structured-session-state'
import type { CodexStructuredSessionStatusMetadata } from './codex-structured-session-status-metadata'
import type { CodexStructuredTurnCancellation } from './codex-structured-turn-cancellation'
import { dispatchCodexTurn, isCodexTurnOptionKey } from './codex-structured-turn-start'

export async function dispatchCodexStructuredAdapterTurn(input: {
  request: Parameters<StructuredAgentSessionAdapter['dispatch']>[0]
  session: CodexSession
  cancellation: CodexStructuredTurnCancellation
  requestTimeoutMs?: number
}): Promise<AgentSessionDispatchOutcome> {
  input.session.dispatchPending = true
  try {
    await input.cancellation.captureBaseline(input.session)
    return await dispatchCodexTurn(input.session, input.request, input.requestTimeoutMs)
  } finally {
    input.session.dispatchPending = false
  }
}

export function cancelCodexStructuredAdapterTurn(input: {
  request: Parameters<StructuredAgentSessionAdapter['cancelTurn']>[0]
  session: CodexSession
  compactions: StructuredSessionCompaction
  cancellation: CodexStructuredTurnCancellation
}): Promise<{ cancelled: boolean }> {
  const turnId = input.compactions.providerTurnId(input.request.sessionId, input.request.turnId)
  return turnId
    ? input.cancellation.cancel(input.session, turnId)
    : Promise.resolve({ cancelled: false })
}

export function compactCodexStructuredAdapterSession(input: {
  request: Parameters<NonNullable<StructuredAgentSessionAdapter['compact']>>[0]
  session: CodexSession
  compactions: StructuredSessionCompaction
  cancellation: CodexStructuredTurnCancellation
  requestTimeoutMs?: number
}) {
  return input.compactions.run(
    input.request.sessionId,
    input.session.threadId,
    async () => {
      await input.cancellation.captureBaseline(input.session)
      return input.session.connection
        .request(
          'thread/compact/start',
          { threadId: input.session.threadId },
          { timeoutMs: input.requestTimeoutMs }
        )
        .catch((error) => {
          if (isCodexAppServerRequestError(error)) {
            return { error: error.message }
          }
          throw error
        })
    },
    input.request.onLateResult,
    input.request.turnId
  )
}

export async function setCodexStructuredAdapterOption(input: {
  request: StructuredAgentSessionSetOptionInput
  session: CodexSession
  statusMetadata: CodexStructuredSessionStatusMetadata
  requestTimeoutMs?: number
}): Promise<Readonly<Record<string, string>>> {
  if (!isCodexTurnOptionKey(input.request.key)) {
    throw new Error(`codex app-server has no thread option named ${input.request.key}`)
  }
  const previousModel = input.session.options.get('model') ?? input.session.reportedOptions.model
  const options = await applyCodexStructuredSessionOption(
    input.session,
    input.request.key,
    input.request.value,
    input.requestTimeoutMs
  )
  const nextModel = input.session.options.get('model') ?? input.session.reportedOptions.model
  if (input.request.key === 'model' && nextModel && nextModel !== previousModel) {
    input.statusMetadata.modelChanged(input.request.sessionId, input.session, nextModel)
  }
  return options
}
