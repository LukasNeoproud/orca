import {
  decodeOrcaInteractionResult,
  encodeOrcaInteractionResult,
  OrcaInteractionRequestSchema,
  parseOrcaInteractionResult,
  type OrcaInteractionRequest,
  type OrcaInteractionResult
} from './orca-interaction'

export const ORCA_INTERACTION_MCP_SERVER = 'orca_interactive_chat'
export const CODEX_MCP_ELICITATION_METHOD = 'mcpServer/elicitation/request'
export const ORCA_INTERACTION_ELICITATION_MESSAGE_PREFIX = 'orca-interaction-v1:'

export const ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer']
} as const

export type OrcaInteractionElicitationResponse =
  | { action: 'accept'; content: { answer: string }; _meta?: unknown }
  | { action: 'decline' | 'cancel'; content?: null; _meta?: unknown }

export function encodeOrcaInteractionElicitationMessage(request: OrcaInteractionRequest): string {
  return `${ORCA_INTERACTION_ELICITATION_MESSAGE_PREFIX}${JSON.stringify(request)}`
}

export function decodeOrcaInteractionElicitationMessage(
  message: unknown
): OrcaInteractionRequest | null {
  if (
    typeof message !== 'string' ||
    !message.startsWith(ORCA_INTERACTION_ELICITATION_MESSAGE_PREFIX)
  ) {
    return null
  }
  try {
    const parsed = OrcaInteractionRequestSchema.safeParse(
      JSON.parse(message.slice(ORCA_INTERACTION_ELICITATION_MESSAGE_PREFIX.length))
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function isOrcaInteractionElicitationRequestedSchema(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'properties', 'required'], ['$schema', 'additionalProperties'])
  ) {
    return false
  }
  const properties = value.properties
  return (
    value.type === 'object' &&
    (value.$schema === undefined || value.$schema === null || typeof value.$schema === 'string') &&
    (value.additionalProperties === undefined || value.additionalProperties === false) &&
    isRecord(properties) &&
    hasOnlyKeys(properties, ['answer']) &&
    isRecord(properties.answer) &&
    hasOnlyKeys(
      properties.answer,
      ['type'],
      ['title', 'description', 'minLength', 'maxLength', 'format']
    ) &&
    properties.answer.type === 'string' &&
    optionalValuesAreNull(properties.answer, [
      'title',
      'description',
      'minLength',
      'maxLength',
      'format'
    ]) &&
    Array.isArray(value.required) &&
    value.required.length === 1 &&
    value.required[0] === 'answer'
  )
}

export function encodeOrcaInteractionElicitationResponse(
  result: OrcaInteractionResult
): OrcaInteractionElicitationResponse {
  return result.status === 'cancelled'
    ? { action: 'cancel', content: null, _meta: null }
    : {
        action: 'accept',
        content: { answer: encodeOrcaInteractionResult(result) },
        _meta: null
      }
}

export function decodeOrcaInteractionElicitationResponse(
  request: OrcaInteractionRequest,
  response: unknown
): OrcaInteractionResult | null {
  if (!isRecord(response)) {
    return null
  }
  if (response.action === 'decline' || response.action === 'cancel') {
    return { status: 'cancelled' }
  }
  if (response.action !== 'accept' || !isRecord(response.content)) {
    return null
  }
  const answer = response.content.answer
  return typeof answer === 'string'
    ? parseOrcaInteractionResult(request, decodeOrcaInteractionResult(answer))
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = []
): boolean {
  const actual = Object.keys(value)
  return (
    required.every((key) => actual.includes(key)) &&
    actual.every((key) => required.includes(key) || optional.includes(key))
  )
}

function optionalValuesAreNull(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => value[key] === undefined || value[key] === null)
}
