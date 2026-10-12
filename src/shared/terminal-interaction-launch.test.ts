import { describe, expect, it, vi } from 'vitest'
import { withTerminalInteractionMcp } from './terminal-interaction-launch'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'
import { buildAgentResumeStartupPlan, buildAgentStartupPlan } from './tui-agent-startup'

// This file pins the injection the shared test setup neutralizes.
vi.unmock('./terminal-interaction-launch')

describe('terminal interaction launch registration', () => {
  it.each([
    ['darwin', 'posix', 'orca'],
    ['linux', 'posix', 'orca-ide'],
    ['win32', 'powershell', 'orca.cmd'],
    ['win32', 'cmd', 'orca.cmd']
  ] as const)('registers one Codex MCP server on %s/%s', (platform, shell, cli) => {
    const command = withTerminalInteractionMcp(
      'codex -- literal',
      'codex',
      shell,
      platform,
      false,
      false
    )
    const parsed = tokenizeStartupCommand(command, shell)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.tokens.slice(0, 2)).toEqual(['codex', '-c'])
    expect(parsed.tokens[2]).toContain(`command="${cli}"`)
    expect(parsed.tokens[2]).toContain('args=["interact","mcp"]')
    expect(parsed.tokens[2]).toContain('ORCA_TERMINAL_HANDLE')
    expect(parsed.tokens[2]).toContain('ORCA_PANE_KEY')
    expect(parsed.tokens[2]).toContain('tool_timeout_sec=3600')
    expect(parsed.tokens.slice(3)).toEqual(['--', 'literal'])
    expect(withTerminalInteractionMcp(command, 'codex', shell, platform, false, false)).toBe(
      command
    )
  })

  it.each([
    ['darwin', 'posix', 'orca-dev'],
    ['linux', 'posix', 'orca-dev'],
    ['win32', 'powershell', 'orca-dev.cmd'],
    ['win32', 'cmd', 'orca-dev.cmd']
  ] as const)('targets the Orca Dev CLI on %s/%s', (platform, shell, cli) => {
    const command = withTerminalInteractionMcp('codex', 'codex', shell, platform, false, true)
    const parsed = tokenizeStartupCommand(command, shell)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.tokens[2]).toContain(`command="${cli}"`)
  })

  it('merges a Claude MCP configuration without disabling other servers', () => {
    const command = withTerminalInteractionMcp(
      'claude --model sonnet',
      'claude',
      'posix',
      'darwin',
      false,
      false
    )
    const parsed = tokenizeStartupCommand(command, 'posix')
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    expect(parsed.tokens[1]).toMatch(/^--mcp-config=/)
    expect(JSON.parse(parsed.tokens[1].slice('--mcp-config='.length))).toEqual({
      mcpServers: { orca_interactive: { command: 'orca', args: ['interact', 'mcp'] } }
    })
    expect(parsed.tokens.slice(2)).toEqual(['--model', 'sonnet'])
    expect(command).not.toContain('--strict-mcp-config')
  })

  it('adds registration to new and historical terminal launches without persisting it', () => {
    const fresh = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'question',
      platform: 'darwin',
      isDev: true,
      cmdOverrides: {}
    })
    expect(fresh?.launchCommand).toContain('orca_interactive')
    expect(fresh?.launchCommand).toContain('command="orca-dev"')
    expect(fresh?.launchConfig.agentCommand).toBe('codex')
    const resumed = buildAgentResumeStartupPlan({
      agent: 'codex',
      platform: 'darwin',
      isDev: true,
      cmdOverrides: {},
      agentCommand: 'codex --profile custom',
      providerSession: { key: 'session_id', id: 'old-thread' }
    })
    expect(resumed?.launchCommand).toContain('orca_interactive')
    expect(resumed?.launchCommand).toContain('command="orca-dev"')
    expect(resumed?.launchCommand).toContain("'resume' 'old-thread'")
    expect(resumed?.launchConfig.agentCommand).toBe('codex --profile custom')
  })

  it.each(['posix', 'powershell', 'cmd'] as const)(
    'keeps the prompt positional after the Claude MCP config in %s',
    (shell) => {
      const plan = buildAgentStartupPlan({
        agent: 'claude',
        prompt: 'fix bug',
        shell,
        platform: shell === 'posix' ? 'darwin' : 'win32',
        cmdOverrides: {}
      })
      const parsed = tokenizeStartupCommand(plan!.launchCommand, shell)
      if (!parsed.ok) {
        throw new Error(parsed.error)
      }
      // The `=` form ends the variadic option, so no `--` is needed before the prompt.
      expect(parsed.tokens.at(-1)).toBe('fix bug')
      expect(parsed.tokens).not.toContain('--')
      expect(parsed.tokens[1]).toMatch(/^--mcp-config=/)
      expect(
        JSON.parse(parsed.tokens[1].slice('--mcp-config='.length)).mcpServers.orca_interactive
      ).toBeDefined()
    }
  )

  it('does not inject stdio into the one-shot SSH shim or arbitrary custom wrappers', () => {
    expect(withTerminalInteractionMcp('codex', 'codex', 'posix', 'linux', true)).toBe('codex')
    expect(withTerminalInteractionMcp('custom-wrapper codex', 'codex', 'posix', 'darwin')).toBe(
      'custom-wrapper codex'
    )
    expect(withTerminalInteractionMcp('gemini', 'gemini', 'posix', 'darwin')).toBe('gemini')
  })

  it('preserves environment prefixes and does not mistake a profile name for MCP config', () => {
    const command = withTerminalInteractionMcp(
      'AGENT_OPTION=value codex --profile orca_interactive',
      'codex',
      'posix',
      'darwin'
    )
    expect(command).toMatch(/^AGENT_OPTION=value codex '-c'/)
    expect(command).toContain('mcp_servers.orca_interactive=')
    expect(command).toContain('--profile orca_interactive')
    expect(withTerminalInteractionMcp(command, 'codex', 'posix', 'darwin')).toBe(command)
    const claude = withTerminalInteractionMcp(
      'AGENT_OPTION=value claude',
      'claude',
      'posix',
      'darwin'
    )
    expect(claude).toMatch(/^AGENT_OPTION=value claude '--mcp-config=/)
    expect(withTerminalInteractionMcp(claude, 'claude', 'posix', 'darwin')).toBe(claude)
  })
})
