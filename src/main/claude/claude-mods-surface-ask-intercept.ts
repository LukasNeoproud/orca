import type { Query } from '@anthropic-ai/claude-agent-sdk'
import {
  claudeModsAskDefaultAnswer,
  isClaudeModsAskSubtype,
  type ClaudeModsAskAnswer,
  type ClaudeModsAskSubtype
} from '../../shared/claude-mods-prompt-answers'

/** One engine → client ask as the CLI sent it: its own request id and request body. */
export type ClaudeModsInboundAsk = {
  requestId: string
  subtype: ClaudeModsAskSubtype
  request: Record<string, unknown>
}

export type ClaudeModsAskHandler = (
  ask: ClaudeModsInboundAsk,
  signal: AbortSignal
) => Promise<ClaudeModsAskAnswer>

/** Installs the handler for the CLI's asks; the returned release is a no-op once replaced. */
export type ClaudeModsAskInterceptor = (handler: ClaudeModsAskHandler) => () => void

/** The SDK's dispatcher for inbound control requests, which refuses every `ui_*` ask. */
type ClaudeQueryControlProcessor = {
  processControlRequest?: (message: unknown, signal: AbortSignal) => Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInboundAsk(message: unknown): ClaudeModsInboundAsk | null {
  if (!isRecord(message) || typeof message.request_id !== 'string') {
    return null
  }
  const request = message.request
  if (!isRecord(request) || !isClaudeModsAskSubtype(request.subtype)) {
    return null
  }
  return { requestId: message.request_id, subtype: request.subtype, request }
}

/**
 * The SDK answers an unknown inbound subtype with an error, which the CLI reads as "another client
 * refused" and waits 5 s on. Wrapping its dispatcher lets the `ui_*` asks be answered at all; an
 * SDK without that method leaves `answerUiAsks` absent, and Orca never names `answers`.
 */
export function claudeQueryUiAskInterceptor(query: Query): {
  answerUiAsks?: ClaudeModsAskInterceptor
} {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: read as optional and typeof-checked before use; Query declares no `processControlRequest`.
  const target = query as unknown as ClaudeQueryControlProcessor
  const original = target.processControlRequest
  if (typeof original !== 'function') {
    return {}
  }
  let handler: ClaudeModsAskHandler | null = null
  target.processControlRequest = function (this: unknown, message: unknown, signal: AbortSignal) {
    const ask = readInboundAsk(message)
    if (!ask) {
      return original.call(this, message, signal)
    }
    // An ask with nobody listening (a detach raced it) still settles at once.
    return handler ? handler(ask, signal) : Promise.resolve(claudeModsAskDefaultAnswer(ask.subtype))
  }
  return {
    answerUiAsks: (next) => {
      handler = next
      return () => {
        if (handler === next) {
          handler = null
        }
      }
    }
  }
}
