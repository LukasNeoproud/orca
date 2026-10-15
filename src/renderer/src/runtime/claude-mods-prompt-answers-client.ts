import type { ClaudeModsAsk, ClaudeModsAskAnswer } from '../../../shared/claude-mods-prompt-answers'
import { readClaudeModsAsk } from '../../../shared/claude-mods-prompt-answers'
import { MAX_CLAUDE_MODS_ANSWER_BYTES } from '../../../shared/rpc-contract/claude-mods-surface-params'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { AGENT_SESSION_CLAUDE_MODS_PROMPT_ANSWERS_RUNTIME_CAPABILITY } from '../../../shared/structured-agent-session-surface-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import { subscribeRuntimeRpc } from './runtime-rpc-subscribe'
import {
  ensureLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from './local-runtime-capabilities'

const RESUBSCRIBE_DELAY_MS = 3_000
/** The host settles an ask at 4 s; an answer still in flight past that is dropped there. */
const ANSWER_TIMEOUT_MS = 4_000

/** Whether the host routes the CLI's asks to a composer; an unknown or failed probe reads as no. */
export async function supportsClaudeModsPromptAnswers(
  target: RuntimeClientTarget
): Promise<boolean> {
  try {
    if (target.kind === 'local') {
      const capabilities =
        readLocalRuntimeCapabilitiesOrUnknown() ?? (await ensureLocalRuntimeCapabilities())
      return (
        capabilities?.includes(AGENT_SESSION_CLAUDE_MODS_PROMPT_ANSWERS_RUNTIME_CAPABILITY) === true
      )
    }
    return await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      AGENT_SESSION_CLAUDE_MODS_PROMPT_ANSWERS_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

function readAsk(value: unknown): ClaudeModsAsk | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  ) {
    return null
  }
  return readClaudeModsAsk(value.id, value)
}

/** The session's asks for as long as the returned stop is not called; rejoins a broken stream. */
export function openClaudeModsAskStream(
  target: RuntimeClientTarget,
  sessionId: string,
  onAsk: (ask: ClaudeModsAsk) => void
): () => void {
  let stopped = false
  let subscription: { unsubscribe: () => void } | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const retry = (): void => {
    if (!stopped && retryTimer === null) {
      subscription = null
      retryTimer = setTimeout(() => {
        retryTimer = null
        open()
      }, RESUBSCRIBE_DELAY_MS)
    }
  }
  const open = (): void => {
    subscribeRuntimeRpc(
      target,
      'agentSession.claudeModsAsks',
      { sessionId },
      {
        onEvent: (result) => {
          const ask = readAsk(result)
          if (ask) {
            onAsk(ask)
          }
        },
        onError: retry,
        onClose: retry
      }
    ).then((opened) => {
      if (stopped) {
        opened.unsubscribe()
      } else {
        subscription = opened
      }
    }, retry)
  }
  open()
  return () => {
    stopped = true
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
    }
    subscription?.unsubscribe()
  }
}

/** Sends one answer; an answer too large for the wire goes as the empty box instead. */
export function answerClaudeModsAsk(
  target: RuntimeClientTarget,
  sessionId: string,
  askId: string,
  answer: ClaudeModsAskAnswer
): Promise<void> {
  const response =
    JSON.stringify(answer).length <= MAX_CLAUDE_MODS_ANSWER_BYTES ? answer : { text: '', cursor: 0 }
  return callRuntimeRpc(
    target,
    'agentSession.claudeModsAnswer',
    { sessionId, askId, response },
    { timeoutMs: ANSWER_TIMEOUT_MS }
  ).then(
    () => {},
    () => {}
  )
}
