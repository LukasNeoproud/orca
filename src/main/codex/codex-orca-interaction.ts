import {
  decodeOrcaInteractionResult,
  OrcaInteractionRequestSchema,
  parseOrcaInteractionResult,
  type OrcaInteractionRequest
} from '../../shared/orca-interaction'

export const CODEX_DYNAMIC_TOOL_CALL_METHOD = 'item/tool/call'
export const ORCA_INTERACT_NAMESPACE = 'orca'
export const ORCA_INTERACT_TOOL = 'interact'

export const ORCA_INTERACTIVE_UI_INSTRUCTIONS = `# Orca Interactive UI

You have access to the \`orca.interact\` tool. When you need structured user input, prefer it over asking the user to manually type selections. Use it for single or multiple choices, yes/no decisions, short forms, and other independent fields. Ask dependent questions in separate calls so you can reason between answers. Do not use it for ordinary conversation or when a free-form reply is more appropriate. If the tool is unavailable, use normal conversational interaction.`

const optionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    recommended: { type: 'boolean' }
  }
}

const fieldBase = {
  id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' },
  label: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', minLength: 1, maxLength: 2000 },
  required: { type: 'boolean' }
}

const choiceProperties = {
  ...fieldBase,
  options: { type: 'array', minItems: 1, maxItems: 64, items: optionSchema },
  allowCustom: { type: 'boolean' }
}

export const ORCA_INTERACT_DYNAMIC_TOOLS = [
  {
    type: 'namespace',
    name: ORCA_INTERACT_NAMESPACE,
    description: 'Orca host-provided structured user interaction.',
    tools: [
      {
        type: 'function',
        name: ORCA_INTERACT_TOOL,
        description:
          'Prefer this native Orca form for structured user input, not ordinary conversation. Returns {status:"submitted",values:{fieldId:value}} (custom values are {type:"custom",value}) or {status:"cancelled"}.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['fields'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', minLength: 1, maxLength: 2000 },
            submitLabel: { type: 'string', minLength: 1, maxLength: 80 },
            fields: {
              type: 'array',
              minItems: 1,
              maxItems: 32,
              items: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label', 'options'],
                    properties: {
                      ...choiceProperties,
                      type: { const: 'single_choice' },
                      default: fieldBase.id
                    }
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label', 'options'],
                    properties: {
                      ...choiceProperties,
                      type: { const: 'multi_choice' },
                      default: { type: 'array', maxItems: 64, items: fieldBase.id }
                    }
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label'],
                    properties: {
                      ...fieldBase,
                      type: { const: 'boolean' },
                      default: { type: 'boolean' }
                    }
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label'],
                    properties: {
                      ...fieldBase,
                      type: { const: 'text' },
                      default: { type: 'string', maxLength: 8000 },
                      placeholder: { type: 'string', maxLength: 200 },
                      minLength: { type: 'integer', minimum: 0, maximum: 8000 },
                      maxLength: { type: 'integer', minimum: 1, maximum: 8000 }
                    }
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label'],
                    properties: {
                      ...fieldBase,
                      type: { const: 'textarea' },
                      default: { type: 'string', maxLength: 32000 },
                      placeholder: { type: 'string', maxLength: 200 },
                      minLength: { type: 'integer', minimum: 0, maximum: 32000 },
                      maxLength: { type: 'integer', minimum: 1, maximum: 32000 }
                    }
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'type', 'label'],
                    properties: {
                      ...fieldBase,
                      type: { const: 'number' },
                      default: { type: 'number' },
                      min: { type: 'number' },
                      max: { type: 'number' },
                      step: { type: 'number', exclusiveMinimum: 0 },
                      unit: { type: 'string', minLength: 1, maxLength: 40 }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]
  }
] as const

function readString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readOrcaInteractionCall(params: unknown): {
  threadId: string
  turnId: string | null
  callId: string
  request: OrcaInteractionRequest
} | null {
  if (typeof params !== 'object' || params === null) {
    return null
  }
  const record = params as Record<string, unknown>
  if (record.namespace !== ORCA_INTERACT_NAMESPACE || record.tool !== ORCA_INTERACT_TOOL) {
    return null
  }
  const threadId = readString(record, 'threadId')
  const callId = readString(record, 'callId')
  const request = OrcaInteractionRequestSchema.safeParse(record.arguments)
  if (!threadId || !callId || !request.success) {
    return null
  }
  return {
    threadId,
    turnId: readString(record, 'turnId'),
    callId,
    request: request.data
  }
}

export function orcaInteractionToolResponse(
  request: OrcaInteractionRequest | undefined,
  answer: string
): Record<string, unknown> {
  const decoded = decodeOrcaInteractionResult(answer)
  const result = request ? parseOrcaInteractionResult(request, decoded) : null
  if (!result) {
    throw new Error(`${answer} is not a valid Orca interaction result`)
  }
  const text = JSON.stringify(result)
  if (new TextEncoder().encode(text).length > 64 * 1024) {
    throw new Error('orca interaction result exceeds bounded registry state')
  }
  return { contentItems: [{ type: 'inputText', text }], success: true }
}
