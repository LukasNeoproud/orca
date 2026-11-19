import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewMcpAgentArgs,
  buildAzureDevOpsReviewAgentPrompt
} from './azure-devops-review-prompt'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'
import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

const pullRequest: AzureDevOpsReviewPullRequest = {
  key: 'dev.azure.com/contoso+repo+7',
  pullRequestId: 7,
  title: 'Fix',
  description: 'Adds retries',
  status: 'active',
  isDraft: false,
  isFork: false,
  organizationKey: 'dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'proj',
  repository: 'app',
  repositoryId: 'repo',
  repoKey: 'dev.azure.com/contoso+repo',
  author: { displayName: 'Author', uniqueName: null },
  myVote: 'none',
  createdAt: '2026-01-01T00:00:00Z',
  closedAt: null,
  sourceBranch: 'feature',
  targetBranch: 'main',
  sourceCommit: null,
  targetCommit: null,
  webUrl: 'https://dev.azure.com/contoso/proj/_git/app/pullrequest/7'
}

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
  it('diffs an active PR against its target branch and a completed one against its last target commit', () => {
    const tools = { cli: 'orca', access: 'mcp' as const }
    expect(buildAzureDevOpsReviewAgentPrompt(pullRequest, tools)).toContain(
      '`git diff origin/main...HEAD`'
    )
    const completed = {
      ...pullRequest,
      status: 'completed' as const,
      sourceCommit: 'abc123',
      targetCommit: 'def456'
    }
    expect(buildAzureDevOpsReviewAgentPrompt(completed, tools)).toContain(
      '`git diff def456...HEAD`'
    )
  })

  it('points MCP-enabled agents at the ado tools with a CLI fallback', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, {
      cli: 'orca-dev',
      access: 'mcp'
    })
    expect(prompt).toContain('`ado_get_pull_request`')
    expect(prompt).toContain('`ado_create_draft`')
    expect(prompt).toContain('`mcp__orca_ado__ado_get_pull_request`')
    expect(prompt).toContain('switch to the CLI at once')
    expect(prompt).toContain(
      '`orca-dev ado draft create --pr dev.azure.com/contoso+repo+7 --kind inline'
    )
  })

  it("points Pi at Orca's native review tools with a CLI fallback", () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, {
      cli: 'orca-dev',
      access: 'pi-tools'
    })
    expect(prompt).toContain(
      '`ado_get_pull_request` (pullRequestKey `dev.azure.com/contoso+repo+7`)'
    )
    expect(prompt).toContain('`ado_create_draft`')
    expect(prompt).not.toContain('mcp__')
    expect(prompt).toContain('switch to the CLI at once')
    expect(prompt).toContain('`orca-dev ado draft update <id> --body-file -`')
  })

  it('uses the given CLI for every Orca command without MCP', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, {
      cli: 'orca-dev',
      access: 'cli'
    })
    expect(prompt).toContain('`orca-dev ado pr dev.azure.com/contoso+repo+7 --json`')
    expect(prompt).toContain(
      '`orca-dev ado draft create --pr dev.azure.com/contoso+repo+7 --kind reply --thread <id> --body-file -`'
    )
    expect(prompt).toContain('`.result.drafts`')
    expect(prompt).not.toMatch(/`orca ado/)
    expect(prompt).not.toContain('ado_create_draft')
  })

  it('asks the agent to review the change against the PR description', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, {
      cli: 'orca',
      access: 'mcp' as const
    })
    expect(prompt).toContain('Read the PR description before the code')
    const bare = buildAzureDevOpsReviewAgentPrompt(
      { ...pullRequest, description: ' ' },
      { cli: 'orca', access: 'mcp' as const }
    )
    expect(bare).toContain('The PR has no description')
  })

  describe.each(['mcp', 'pi-tools', 'cli'] as const)('for an agent with %s access', (access) => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(pullRequest, { cli: 'orca-dev', access })

    it('asks for a severity and evidence for every finding', () => {
      expect(prompt).toContain('Give every finding a severity (error, warning, suggestion, nit:')
      expect(prompt).toContain(
        'and evidence: one or more code citations with the file, the line range and the quoted lines exactly as they are at the reviewed commit'
      )
    })

    it('says a finding without evidence is marked as uncertain', () => {
      expect(prompt).toContain('A finding without evidence is marked as uncertain for the user')
      expect(prompt).toContain('one whose quote is not in the file as contradicted')
      expect(prompt).toContain('do not invent a quote')
    })

    it('says how to pass both on the CLI, with the shape of a citation', () => {
      expect(prompt).toContain('`--severity error|warning|suggestion|nit`')
      expect(prompt).toContain('`--evidence-file <path>`')
      expect(prompt).toContain(
        '`{"kind":"code-citation","filePath":"<path>","startLine":<n>,"endLine":<n>,"quote":"<the lines as they are in the file>","note":"<what they show>"}`'
      )
    })

    it('names the tool fields only where the agent has the tools', () => {
      expect(prompt.includes('each with its `severity` and `evidence`')).toBe(access !== 'cli')
    })
  })
})
