import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_CONTEXT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent-context', 'request'],
    summary: 'Queue an Orca-owned context transition for this Codex session',
    usage:
      'orca agent-context request --mode compact|fresh [--request-id <id>] [--json] < transition.json',
    allowedFlags: [...GLOBAL_FLAGS, 'mode', 'request-id'],
    notes: [
      'Uses the Orca session identity inherited by this process; callers cannot choose another session.',
      'Reads a complete JSON transition input from standard input. Read status before treating compaction or a fresh context as complete.'
    ]
  },
  {
    path: ['agent-context', 'status'],
    summary: 'Read one Orca-owned context-transition request',
    usage: 'orca agent-context status --request-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-id']
  },
  {
    path: ['agent-context', 'cancel'],
    summary: 'Cancel one Orca-owned context-transition request',
    usage: 'orca agent-context cancel --request-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-id']
  },
  {
    path: ['agent-context', 'state'],
    summary: 'Read context-transition capability and session state',
    usage: 'orca agent-context state [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent-context', 'mcp'],
    hidden: true,
    summary: 'Run the Orca context-management MCP server over stdio',
    usage: 'orca agent-context mcp',
    allowedFlags: []
  }
]
