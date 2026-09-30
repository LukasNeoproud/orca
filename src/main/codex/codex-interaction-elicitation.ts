import {
  decodeOrcaInteractionElicitationMessage,
  encodeOrcaInteractionElicitationResponse,
  isOrcaInteractionElicitationRequestedSchema,
  CODEX_MCP_ELICITATION_METHOD,
  ORCA_INTERACTION_MCP_SERVER
} from '../../shared/orca-interaction-elicitation'
import type { OrcaInteractionRequest, OrcaInteractionResult } from '../../shared/orca-interaction'
import { answerOrcaInteraction } from './codex-interaction-question-fallback'
import { CODEX_DYNAMIC_TOOL_CALL_METHOD, readOrcaInteractionCall } from './codex-orca-interaction'

export function isCodexInteractionMethod(method: string): boolean {
  return method === CODEX_DYNAMIC_TOOL_CALL_METHOD || method === CODEX_MCP_ELICITATION_METHOD
}

export function readCodexInteraction(request: {
  id: number | string
  method: string
  params: unknown
}): ReturnType<typeof readOrcaInteractionCall> {
  if (request.method === CODEX_DYNAMIC_TOOL_CALL_METHOD) {
    return readOrcaInteractionCall(request.params)
  }
  const elicitation =
    request.method === CODEX_MCP_ELICITATION_METHOD
      ? readOrcaInteractionElicitation(request.params)
      : null
  return elicitation ? { ...elicitation, callId: `mcp-elicitation:${request.id}` } : null
}

export function readOrcaInteractionElicitation(params: unknown): {
  threadId: string
  turnId: string | null
  request: OrcaInteractionRequest
} | null {
  if (!params || typeof params !== 'object') {
    return null
  }
  const record = params as Record<string, unknown>
  if (
    record.serverName !== ORCA_INTERACTION_MCP_SERVER ||
    record.mode !== 'form' ||
    typeof record.threadId !== 'string' ||
    !record.threadId ||
    !isOrcaInteractionElicitationRequestedSchema(record.requestedSchema)
  ) {
    return null
  }
  const request = decodeOrcaInteractionElicitationMessage(record.message)
  return request
    ? {
        threadId: record.threadId,
        turnId: typeof record.turnId === 'string' ? record.turnId : null,
        request
      }
    : null
}

export function answerOrcaInteractionElicitation(
  request: OrcaInteractionRequest | undefined,
  answer: string
): Record<string, unknown> {
  const validated = answerOrcaInteraction(request, answer)
  return encodeOrcaInteractionElicitationResponse(
    JSON.parse(validated.contentItems[0].text) as OrcaInteractionResult
  )
}

export function answerCodexInteraction(
  method: string,
  request: OrcaInteractionRequest | undefined,
  answer: string
): Record<string, unknown> {
  return method === CODEX_MCP_ELICITATION_METHOD
    ? answerOrcaInteractionElicitation(request, answer)
    : answerOrcaInteraction(request, answer)
}
