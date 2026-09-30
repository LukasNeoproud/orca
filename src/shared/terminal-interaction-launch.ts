import { getOrcaCliCommandNameForPlatform } from './orca-cli-command-name'
import {
  isPosixStartupShell,
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import type { TuiAgent } from './tui-agent'

const MCP_SERVER = 'orca_interactive'
const MCP_ENV = [
  'ORCA_TERMINAL_HANDLE',
  'ORCA_PANE_KEY',
  'ORCA_USER_DATA_PATH',
  'ORCA_ENVIRONMENT',
  'ORCA_PAIRING_CODE',
  'ORCA_REMOTE_PAIRING'
]

export function withTerminalInteractionMcp(
  command: string,
  agent: TuiAgent,
  shell: AgentStartupShell,
  platform: NodeJS.Platform,
  isRemote = false,
  isDev = process.env.NODE_ENV === 'development'
): string {
  // The direct SSH shim transports one-shot CLI calls, not MCP stdio streams.
  if (isRemote || (agent !== 'codex' && agent !== 'claude')) {
    return command
  }
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return command
  }
  let index = shell === 'powershell' && parsed.tokens[0] === '&' ? 1 : 0
  while (
    isPosixStartupShell(shell) &&
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(parsed.tokens[index] ?? '')
  ) {
    index += 1
  }
  const executable = parsed.tokens[index]?.split(/[\\/]/).pop()
  if (!executable || !new RegExp(`^${agent}(?:\\.(?:exe|cmd|bat|ps1))?$`, 'i').test(executable)) {
    return command
  }
  if (hasInteractionConfig(parsed.tokens.slice(index + 1), agent)) {
    return command
  }
  const cli = isDev
    ? platform === 'win32'
      ? 'orca-dev.cmd'
      : 'orca-dev'
    : getOrcaCliCommandNameForPlatform(platform)
  const config =
    agent === 'codex'
      ? [
          '-c',
          `mcp_servers.${MCP_SERVER}={command=${JSON.stringify(cli)},args=["interact","mcp"],env_vars=${JSON.stringify(MCP_ENV)},tool_timeout_sec=3600}`
        ]
      : [
          '--mcp-config',
          JSON.stringify({
            mcpServers: { [MCP_SERVER]: { command: cli, args: ['interact', 'mcp'] } }
          })
        ]
  const suffix = config.map((arg) => quoteStartupArg(arg, shell)).join(' ')
  const end = parsed.spans[index].end
  return `${command.slice(0, end)} ${suffix}${command.slice(end)}`
}

function hasInteractionConfig(tokens: string[], agent: 'codex' | 'claude'): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      break
    }
    if (agent === 'codex') {
      const value =
        token === '-c' || token === '--config'
          ? tokens[++index]
          : token.startsWith('--config=')
            ? token.slice(9)
            : ''
      if (/^mcp_servers\.orca_interactive(?:\.|\s*=)/.test(value ?? '')) {
        return true
      }
    } else if (token === '--mcp-config' || token.startsWith('--mcp-config=')) {
      const value = token === '--mcp-config' ? tokens[++index] : token.slice(13)
      try {
        if (JSON.parse(value ?? '').mcpServers?.[MCP_SERVER]) {
          return true
        }
      } catch {
        // File-backed user configs remain untouched; only detect explicit inline registration.
      }
    }
  }
  return false
}
