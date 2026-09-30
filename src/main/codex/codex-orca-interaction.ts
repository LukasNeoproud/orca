import {
  decodeOrcaInteractionResult,
  OrcaInteractionRequestSchema,
  parseOrcaInteractionResult,
  type OrcaInteractionRequest
} from '../../shared/orca-interaction'
import { ORCA_INTERACT_INPUT_SCHEMA } from '../../shared/orca-interaction-tool'

export const CODEX_DYNAMIC_TOOL_CALL_METHOD = 'item/tool/call'
export const ORCA_INTERACT_NAMESPACE = 'orca'
export const ORCA_INTERACT_TOOL = 'interact'

export const ORCA_INTERACTIVE_UI_INSTRUCTIONS = `# Orca Interactive UI

You have access to the \`orca.interact\` tool. When you need structured user input, prefer it over asking the user to manually type selections. Use it for single or multiple choices, yes/no decisions, short forms, and other independent fields. Ask dependent questions in separate calls so you can reason between answers. Do not use it for ordinary conversation or when a free-form reply is more appropriate. If the tool is unavailable, use normal conversational interaction.`

export const ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS = `${ORCA_INTERACTIVE_UI_INSTRUCTIONS}

In this resumed Orca chat, the equivalent host tool is available as \`mcp__orca_interactive_chat__interact\` (MCP server \`orca_interactive_chat\`, tool \`interact\`). Prefer native \`orca.interact\` when present; otherwise use this MCP tool for the same native form and structured result. For structured questions, prefer these Orca tools over \`request_user_input\` or \`request_user_input_async\`. If tools are deferred, discover/load the Orca MCP tool before falling back to text. A missing native \`orca.interact\` does not mean the MCP alternative is unavailable.`

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
        inputSchema: ORCA_INTERACT_INPUT_SCHEMA
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
): { contentItems: [{ type: 'inputText'; text: string }]; success: true } {
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
