import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewMcpAgentArgs,
  buildAzureDevOpsReviewAgentPrompt
} from './azure-devops-review-prompt'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'
import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

const pullRequest = {
  key: 'dev.azure.com/contoso+repo+7',
  pullRequestId: 7,
  title: 'Fix',
  repository: 'app',
  targetBranch: 'main'
} as AzureDevOpsReviewPullRequest

describe('azureDevOpsReviewMcpAgentArgs', () => {
  it('registers orca ado mcp inline for Claude', () => {
    const args = azureDevOpsReviewMcpAgentArgs('claude', 'posix', 'orca-dev')
    const parsed = tokenizeStartupCommand(args ?? '', 'posix')
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    expect(parsed.tokens[0]).toMatch(/^--mcp-config=/)
    expect(JSON.parse(parsed.tokens[0].slice('--mcp-config='.length))).toEqual({
      mcpServers: { orca_ado: { command: 'orca-dev', args: ['ado', 'mcp'] } }
    })
  })

  it('registers orca ado mcp inline for Codex with the Orca environment', () => {
    const args = azureDevOpsReviewMcpAgentArgs('codex', 'powershell', 'orca.cmd')
    const parsed = tokenizeStartupCommand(args ?? '', 'powershell')
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    expect(parsed.tokens[0]).toBe('-c')
    expect(parsed.tokens[1]).toContain('mcp_servers.orca_ado={command="orca.cmd"')
    expect(parsed.tokens[1]).toContain('args=["ado","mcp"]')
    expect(parsed.tokens[1]).toContain('ORCA_USER_DATA_PATH')
  })

  it('leaves other agents on the CLI', () => {
    expect(azureDevOpsReviewMcpAgentArgs('gemini', 'posix', 'orca')).toBeNull()
  })
})

describe('buildAzureDevOpsReviewAgentPrompt', () => {
  it('points MCP-enabled agents at the ado tools with a CLI fallback', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, { cli: 'orca-dev', mcp: true })
    expect(prompt).toContain('`ado_get_pull_request`')
    expect(prompt).toContain('`ado_create_draft`')
    expect(prompt).toContain('`orca-dev ado --help`')
  })

  it('uses the given CLI for every Orca command without MCP', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, { cli: 'orca-dev', mcp: false })
    expect(prompt).toContain('`orca-dev ado pr dev.azure.com/contoso+repo+7 --json`')
    expect(prompt).toContain('`orca-dev ado draft create`')
    expect(prompt).not.toMatch(/`orca ado/)
    expect(prompt).not.toContain('ado_create_draft')
  })
})
