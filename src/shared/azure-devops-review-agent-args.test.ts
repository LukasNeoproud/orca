import { describe, expect, it } from 'vitest'
import { azureDevOpsReviewAgentLaunchArgs } from './azure-devops-review-agent-args'

describe('azureDevOpsReviewAgentLaunchArgs', () => {
  const base = { platform: 'darwin' as const, cli: 'orca-dev', settings: null }

  it('registers the MCP server, then auto permissions, then the user defaults', () => {
    const launch = azureDevOpsReviewAgentLaunchArgs({
      ...base,
      agent: 'claude',
      settings: { agentDefaultArgs: { claude: '--model opus' } },
      options: { permissions: 'auto', surface: 'terminal' }
    })
    expect(launch.tools).toBe('mcp')
    expect(launch.agentArgs).toMatch(
      /^'--mcp-config=.*orca-dev.*' --permission-mode auto --model opus$/
    )
  })

  it('leaves permissions to a structured chat', () => {
    const launch = azureDevOpsReviewAgentLaunchArgs({
      ...base,
      agent: 'claude',
      options: { permissions: 'auto', surface: 'chat' }
    })
    expect(launch.agentArgs).not.toContain('--permission-mode')
  })

  it("loads Orca's Pi extension without the PR checkout's own Pi resources", () => {
    const launch = azureDevOpsReviewAgentLaunchArgs({
      ...base,
      agent: 'pi',
      settings: { agentDefaultArgs: { pi: '--model sonnet' } },
      options: { permissions: 'auto', surface: 'terminal' },
      piExtensionPath: '/Users/me/Library/Application Support/orca/pi-review-extension/tools.ts'
    })
    expect(launch).toEqual({
      agentArgs:
        "--no-approve --extension '/Users/me/Library/Application Support/orca/pi-review-extension/tools.ts' --model sonnet",
      tools: 'pi-tools'
    })
  })

  it('quotes the Pi extension path for PowerShell', () => {
    const launch = azureDevOpsReviewAgentLaunchArgs({
      ...base,
      platform: 'win32',
      cli: 'orca.cmd',
      agent: 'pi',
      options: { permissions: 'auto', surface: 'terminal' },
      piExtensionPath: "C:\\Users\\O'Neil\\AppData\\Roaming\\orca\\tools.ts"
    })
    expect(launch.agentArgs).toBe(
      "--no-approve --extension 'C:\\Users\\O''Neil\\AppData\\Roaming\\orca\\tools.ts'"
    )
  })

  it('points Pi at the CLI when its tools are not loaded', () => {
    expect(
      azureDevOpsReviewAgentLaunchArgs({
        ...base,
        agent: 'pi',
        options: { permissions: 'auto', surface: 'terminal' }
      })
    ).toEqual({ agentArgs: '--no-approve', tools: 'cli' })
    // A structured Pi chat starts without launch flags; they only apply if it falls back to a terminal.
    expect(
      azureDevOpsReviewAgentLaunchArgs({
        ...base,
        agent: 'pi',
        options: { permissions: 'auto', surface: 'chat' },
        piExtensionPath: '/tmp/tools.ts'
      }).tools
    ).toBe('cli')
  })

  it('keeps saved defaults for agents without inline MCP', () => {
    expect(
      azureDevOpsReviewAgentLaunchArgs({
        ...base,
        agent: 'gemini',
        options: { permissions: 'settings', surface: 'terminal' }
      })
    ).toEqual({ agentArgs: undefined, tools: 'cli' })
  })
})
