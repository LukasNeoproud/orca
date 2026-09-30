import { ORCA_INTERACT_INPUT_SCHEMA } from '../shared/orca-interaction-tool'
import type { RuntimeClient } from './runtime-client'
import {
  hasTerminalInteractionEnvironment,
  parseTerminalInteractionRequest,
  requestTerminalInteraction
} from './terminal-interaction-client'
import { runStdioMcpServer, type McpJsonRecord } from './stdio-mcp-server'

const INTERACTION_TOOL = {
  name: 'interact',
  description:
    'Open an Orca form for structured user input. Returns a submitted values object or an explicit cancellation.',
  inputSchema: ORCA_INTERACT_INPUT_SCHEMA as McpJsonRecord
}

const INSTRUCTIONS =
  'Prefer the interact tool for structured choices and forms. Use ordinary conversation for free-form discussion.'

export function runTerminalInteractionMcpServer(
  client: Pick<RuntimeClient, 'call'>,
  input: NodeJS.ReadableStream = process.stdin,
  write: (value: McpJsonRecord) => void = (value) =>
    process.stdout.write(`${JSON.stringify(value)}\n`)
): Promise<void> {
  return runStdioMcpServer(
    {
      serverInfo: { name: 'orca', version: '1.0.0' },
      instructions: INSTRUCTIONS,
      listTools: () => (hasTerminalInteractionEnvironment() ? [INTERACTION_TOOL] : []),
      callTool: async (name, args, signal) => {
        if (name !== 'interact') {
          throw new Error(`Unknown tool: ${name}`)
        }
        if (!hasTerminalInteractionEnvironment()) {
          throw new Error('Orca interaction is available only inside an Orca-owned terminal.')
        }
        return await requestTerminalInteraction(client, parseTerminalInteractionRequest(args), {
          signal
        })
      }
    },
    input,
    write
  )
}
