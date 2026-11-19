import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import { isAgentPromptStalledError } from '../runtime/agent-prompt-submission-verification'
import { createLaunchedAgentWriteGuard } from '../runtime/launched-agent-write-guard'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { sendAgentTurn } from '../runtime/orchestration/send-agent-turn'
import type {
  QualityGateFeedbackDelivery,
  QualityGateLoopAgent
} from './quality-gate-feedback-loop'

/** How long a finished agent gets to show its composer before the message is given up on. */
const TERMINAL_IDLE_WAIT_MS = 15_000
const USER_INPUT_ERROR = 'user_input_since_turn'
const CALLER_KEY = 'trusted-local:quality-gates'
const SENDER_NAME = 'Quality gates'

export type QualityGateFeedbackDeliveryRuntime = Pick<
  OrcaRuntimeService,
  | 'getTerminalHandleForPaneKey'
  | 'waitForTerminal'
  | 'sendTerminalAgentPrompt'
  | 'readLaunchedAgentForeground'
  | 'subscribeToTerminalData'
  | 'launchedAgentHostProvesAgent'
> & { terminalRunFacts: Pick<OrcaRuntimeService['terminalRunFacts'], 'readLastInputAt'> }

export type QualityGateFeedbackDeliveryDeps = {
  runtime: QualityGateFeedbackDeliveryRuntime
  /** Null on a host with no structured chat, such as one that serves terminals only. */
  structuredHost: () => StructuredAgentSessionHost | null
  newOperationId: () => string
}

const refused = (
  detail: string,
  reason: 'not-deliverable' | 'user-input' = 'not-deliverable'
): QualityGateFeedbackDelivery => ({ kind: 'not-deliverable', reason, detail })

async function deliverToTerminal(
  deps: QualityGateFeedbackDeliveryDeps,
  agent: QualityGateLoopAgent,
  text: string
): Promise<QualityGateFeedbackDelivery> {
  const { runtime } = deps
  const handle = agent.terminalHandle ?? runtime.getTerminalHandleForPaneKey(agent.paneKey)
  const agentType = agent.agentType
  if (!handle || !isTuiAgent(agentType)) {
    return refused('the agent has no terminal this host can write to')
  }
  // The hook said the turn ended; the terminal's own readiness rules say whether a prompt or a
  // dialog is in the way. Nothing here reads the screen itself.
  const wait = await runtime.waitForTerminal(handle, {
    condition: 'tui-idle',
    timeoutMs: TERMINAL_IDLE_WAIT_MS
  })
  if (!wait.satisfied) {
    return refused(`the agent's terminal is not idle (${wait.blockedReason ?? wait.status})`)
  }
  const guard = createLaunchedAgentWriteGuard(runtime, agentType, {
    unprovableHost: 'write-unless-shell'
  })
  // Typed input after the turn began may be an unsent draft; only the first write can tell,
  // because the paste itself counts as input for the Enter that follows it.
  const inputFloor = agent.turnStartedAt ?? agent.completedAt
  let checkedInput = false
  try {
    await sendAgentTurn({
      kind: 'terminal',
      runtime,
      handle,
      turn: { purpose: 'quality-gate-feedback', body: text, operationId: deps.newOperationId() },
      beforeWrite: async (ptyId) => {
        if (!checkedInput) {
          checkedInput = true
          const lastInputAt = runtime.terminalRunFacts.readLastInputAt(ptyId)
          if (lastInputAt !== null && lastInputAt > inputFloor) {
            throw new Error(USER_INPUT_ERROR)
          }
        }
        await guard.beforeWrite(ptyId)
      }
    })
    return { kind: 'sent' }
  } catch (error) {
    // Raised after the write: the paste landed and only the turn start went unseen.
    if (isAgentPromptStalledError(error)) {
      return { kind: 'sent' }
    }
    if (error instanceof Error && error.message === USER_INPUT_ERROR) {
      return refused('somebody typed into the terminal since the turn began', 'user-input')
    }
    return refused(error instanceof Error ? error.message : String(error))
  } finally {
    guard.dispose()
  }
}

async function deliverToStructuredSession(
  deps: QualityGateFeedbackDeliveryDeps,
  sessionId: string,
  text: string
): Promise<QualityGateFeedbackDelivery> {
  const host = deps.structuredHost()
  const fence = host?.deps.store.getRecord(sessionId)?.lease.runtimeFence
  if (!host || fence === undefined) {
    return refused('the chat session is not attached to this host')
  }
  const body: AgentJournalMessageItem = {
    kind: 'message',
    role: 'user',
    blocks: [{ type: 'text', text }],
    // Marks the message as not the person's; no orchestration record stands behind it.
    from: {
      kind: 'agent',
      senders: [
        {
          party: { address: 'orca:quality-gates', terminalHandle: null, orcaSessionId: null },
          name: SENDER_NAME
        }
      ],
      orchestration: null
    }
  }
  const outcome = await sendAgentTurn({
    kind: 'structured-session',
    host,
    sessionId,
    callerKey: CALLER_KEY,
    // `queue`: if a turn opened since the step ended, the message waits as a card the user sees
    // instead of steering that turn.
    turn: {
      body,
      delivery: 'queue',
      operationId: deps.newOperationId(),
      expectedRuntimeFence: fence
    }
  })
  if (outcome.kind === 'refused') {
    return refused(`the chat refused the message (${outcome.refusal.code})`)
  }
  if (outcome.kind === 'sent' && outcome.submission?.dispatchState === 'rejected') {
    return refused('the agent rejected the message')
  }
  return { kind: 'sent' }
}

/** Sends the failures to the agent whose step ended, by the path a user's own message takes. */
export function createQualityGateFeedbackDelivery(deps: QualityGateFeedbackDeliveryDeps) {
  return (agent: QualityGateLoopAgent, text: string): Promise<QualityGateFeedbackDelivery> =>
    agent.structuredSessionId
      ? deliverToStructuredSession(deps, agent.structuredSessionId, text)
      : deliverToTerminal(deps, agent, text)
}
