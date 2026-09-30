import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const INTERACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['interact', 'request'],
    summary: 'Open an Orca form and wait for the user response',
    usage: 'orca interact request --request-stdin [--timeout-ms <ms>] [--json] < request.json',
    allowedFlags: [...GLOBAL_FLAGS, 'request-stdin', 'timeout-ms'],
    notes: [
      'Uses the identity inherited from the current Orca terminal; callers cannot target another terminal.',
      'Reads one structured interaction request from standard input and blocks until it is answered, cancelled, or times out. Use --json for agent-driven calls.'
    ]
  },
  {
    path: ['interact', 'mcp'],
    hidden: true,
    summary: 'Run the terminal-scoped Orca interaction MCP server over stdio',
    usage: 'orca interact mcp',
    allowedFlags: []
  },
  {
    path: ['interact', 'chat-mcp'],
    hidden: true,
    summary: 'Run the chat-scoped Orca interaction MCP server over stdio',
    usage: 'orca interact chat-mcp',
    allowedFlags: []
  }
]
