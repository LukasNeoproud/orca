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
    expect(launch.mcp).toBe(true)
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

  it('keeps saved defaults for agents without inline MCP', () => {
    expect(
      azureDevOpsReviewAgentLaunchArgs({
        ...base,
        agent: 'gemini',
        options: { permissions: 'settings', surface: 'terminal' }
      })
    ).toEqual({ agentArgs: undefined, mcp: false })
  })
})
