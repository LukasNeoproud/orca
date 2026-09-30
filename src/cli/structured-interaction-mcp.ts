import {
  decodeOrcaInteractionElicitationResponse,
  encodeOrcaInteractionElicitationMessage,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA,
  ORCA_INTERACTION_MCP_SERVER
} from '../shared/orca-interaction-elicitation'
import { OrcaInteractionRequestSchema } from '../shared/orca-interaction'
import { ORCA_INTERACT_INPUT_SCHEMA } from '../shared/orca-interaction-tool'
import { runStdioMcpServer, type McpJsonRecord } from './stdio-mcp-server'
import {
  requestStructuredInteractionSocket,
  structuredInteractionSocketEnvironment
} from './structured-interaction-socket-client'

const INTERACTION_TOOL = {
  name: 'interact',
  description:
    'Ask for structured user input. Returns submitted field values or an explicit cancellation.',
  inputSchema: ORCA_INTERACT_INPUT_SCHEMA as McpJsonRecord,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
}

const INSTRUCTIONS =
  'Use interact for one or more independent structured fields; ask dependent questions in separate calls. Use ordinary conversation for free-form discussion or if this tool is unavailable. Prefer a native orca.interact tool when one is also available.'

export function runStructuredInteractionMcpServer(
  input: NodeJS.ReadableStream = process.stdin,
  write: (value: McpJsonRecord) => void = (value) =>
    process.stdout.write(`${JSON.stringify(value)}\n`),
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return runStdioMcpServer(
    {
      serverInfo: { name: ORCA_INTERACTION_MCP_SERVER, version: '1.0.0' },
      protocolVersion: '2025-06-18',
      instructions: INSTRUCTIONS,
      listTools: () => [INTERACTION_TOOL],
      callTool: async (name, args, signal, requestClient) => {
        if (name !== INTERACTION_TOOL.name) {
          throw new Error(`Unknown tool: ${name}`)
        }
        const parsed = OrcaInteractionRequestSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error(
            `Invalid interaction request: ${parsed.error.issues[0]?.message ?? 'invalid'}`
          )
        }
        const socketEnvironment = structuredInteractionSocketEnvironment(environment)
        if (socketEnvironment) {
          return requestStructuredInteractionSocket(socketEnvironment, parsed.data, signal)
        }
        const response = await requestClient(
          'elicitation/create',
          {
            mode: 'form',
            message: encodeOrcaInteractionElicitationMessage(parsed.data),
            requestedSchema: ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
          },
          signal
        )
        const result = decodeOrcaInteractionElicitationResponse(parsed.data, response)
        if (!result) {
          throw new Error('Invalid Orca interaction response')
        }
        return result
      }
    },
    input,
    write
  )
}
