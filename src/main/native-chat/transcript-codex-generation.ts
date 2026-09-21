import type { NativeChatMessage } from '../../shared/native-chat-types'
import { asRecord, extractString, parseJsonObject } from '../ai-vault/session-scanner-values'

export type CodexTranscriptDecodeDirection = 'forward' | 'reverse'
export type CodexTranscriptLineDecoder = ((
  line: string,
  fallbackId: string
) => NativeChatMessage | null) & {
  reset: () => void
  reverse: () => CodexTranscriptLineDecoder
}

type CodexTurnGenerationContext = {
  model?: string
  serviceTier?: string
}

/**
 * Builds a decoder scoped to one sequential transcript pass. Codex writes a
 * `turn_context` before its response records, so metadata must never leak
 * between independent reads or across a later context that omits a field.
 */
export function createCodexTranscriptLineDecoder(
  decodeCodexTranscriptLine: (line: string, fallbackId: string) => NativeChatMessage | null,
  direction: CodexTranscriptDecodeDirection = 'forward',
  onFirstReverseContext?: (context: CodexTurnGenerationContext) => void
): CodexTranscriptLineDecoder {
  let context: CodexTurnGenerationContext | null = null
  const pendingReverseResponses: NativeChatMessage[] = []
  let observedReverseContext = false

  const decode: CodexTranscriptLineDecoder = (line, fallbackId) => {
    const turnContext = line.includes('"turn_context"') ? codexTurnContext(line) : undefined
    if (turnContext !== undefined) {
      if (direction === 'forward') {
        context = turnContext
      } else {
        if (!observedReverseContext) {
          observedReverseContext = true
          onFirstReverseContext?.(turnContext)
        }
        for (const response of pendingReverseResponses) {
          const generation = codexUnavailableGeneration(turnContext)
          if (generation) {
            response.generation = generation
          }
        }
        pendingReverseResponses.length = 0
      }
      return null
    }

    const message = decodeCodexTranscriptLine(line, fallbackId)
    if (message?.role !== 'assistant') {
      return message
    }
    if (direction === 'forward') {
      if (context) {
        const generation = codexUnavailableGeneration(context)
        if (generation) {
          message.generation = generation
        }
      }
    } else {
      pendingReverseResponses.push(message)
    }
    return message
  }
  decode.reset = () => {
    context = null
    pendingReverseResponses.length = 0
    observedReverseContext = false
  }
  decode.reverse = () =>
    createCodexTranscriptLineDecoder(decodeCodexTranscriptLine, 'reverse', (nextContext) => {
      context = nextContext
    })
  return decode
}

function codexTurnContext(line: string): CodexTurnGenerationContext | undefined {
  const record = parseJsonObject(line)
  if (record?.type !== 'turn_context') {
    return undefined
  }
  const payload = asRecord(record.payload)
  if (!payload) {
    return {}
  }
  const model = extractString(payload.model)
  const serviceTier = extractString(payload.service_tier)
  return {
    ...(model ? { model } : {}),
    ...(serviceTier ? { serviceTier } : {})
  }
}

function codexUnavailableGeneration(context: CodexTurnGenerationContext) {
  if (!context.model && !context.serviceTier) {
    return undefined
  }
  return {
    ...context,
    method: 'stream-estimate' as const,
    unavailableReason: 'timing-unavailable'
  }
}
