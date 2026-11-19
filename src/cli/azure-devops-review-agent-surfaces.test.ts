import { describe, expect, it } from 'vitest'
import { buildAzureDevOpsDraftReworkPrompt } from '../shared/azure-devops-draft-rework-prompt'
import { buildAzureDevOpsFeedbackAgentPrompt } from '../shared/azure-devops-feedback-prompt'
import { buildAzureDevOpsReviewAgentPrompt } from '../shared/azure-devops-review-prompt'
import { AZURE_DEVOPS_REVIEW_TOOLS } from '../shared/azure-devops-review-tools'
import { callAzureDevOpsReviewTool } from './azure-devops-review-mcp'
import { AZURE_DEVOPS_HANDLERS } from './handlers/azure-devops'
import { AZURE_DEVOPS_COMMAND_SPECS } from './specs/azure-devops'

/**
 * What an agent can reach: the MCP tools, the `orca ado` commands and the prompts (the Pi
 * extension has its own test next to its source). None of them may publish a draft or cast a
 * vote; only the user does, in the app.
 */

const WRITES_OUT = /vote|publish|approv|reject|complete|abandon/i

const pullRequest = {
  key: 'dev.azure.com/contoso+repo+7',
  pullRequestId: 7,
  title: 'Clamp negative prices',
  repository: 'app',
  sourceBranch: 'feature/prices',
  targetBranch: 'main',
  status: 'active' as const,
  sourceCommit: 's7',
  targetCommit: 't7'
}

/** Arguments that satisfy every tool, so each one reaches its RPC call. */
const TOOL_ARGUMENTS = {
  pullRequestKey: pullRequest.key,
  id: 'd1',
  kind: 'general',
  body: 'Check the rounding.',
  status: 'active',
  // An agent may try to smuggle a vote through; nothing may forward it.
  vote: 'approved'
}

describe('Azure DevOps review surfaces an agent can call', () => {
  it('offers exactly the read and draft tools', () => {
    expect(AZURE_DEVOPS_REVIEW_TOOLS.map((tool) => tool.name)).toEqual([
      'ado_list_pull_requests',
      'ado_get_pull_request',
      'ado_list_drafts',
      'ado_create_draft',
      'ado_update_draft',
      'ado_delete_draft'
    ])
  })

  it('has no tool or tool argument for voting or publishing', () => {
    for (const tool of AZURE_DEVOPS_REVIEW_TOOLS) {
      expect(tool.name).not.toMatch(WRITES_OUT)
      const properties = tool.inputSchema.properties
      expect(Object.keys(properties && typeof properties === 'object' ? properties : {})).toEqual(
        expect.not.arrayContaining([expect.stringMatching(WRITES_OUT)])
      )
    }
  })

  it('calls only read and draft methods from every MCP tool and never forwards a vote', async () => {
    const calls: { method: string; params: unknown }[] = []
    const client = {
      call: async (method: string, params?: unknown) => {
        calls.push({ method, params })
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tools read only `.result` of the response, which this stub provides.
        return { result: {} } as never
      }
    }

    for (const tool of AZURE_DEVOPS_REVIEW_TOOLS) {
      await callAzureDevOpsReviewTool(client, tool.name, TOOL_ARGUMENTS)
    }

    expect(calls.map((call) => call.method).sort()).toEqual([
      'azureDevOpsReview.createDraft',
      'azureDevOpsReview.deleteDraft',
      'azureDevOpsReview.drafts',
      'azureDevOpsReview.get',
      'azureDevOpsReview.list',
      'azureDevOpsReview.updateDraft'
    ])
    expect(JSON.stringify(calls)).not.toMatch(/"vote"/)
    await expect(callAzureDevOpsReviewTool(client, 'ado_vote', TOOL_ARGUMENTS)).rejects.toThrow(
      'Unknown tool'
    )
  })

  it('has no orca ado command or flag for voting or publishing', () => {
    const paths = AZURE_DEVOPS_COMMAND_SPECS.map((spec) => spec.path.join(' '))
    expect(paths).toEqual([
      'ado prs',
      'ado pr',
      'ado drafts',
      'ado draft create',
      'ado draft update',
      'ado draft rm',
      'ado mcp'
    ])
    expect(Object.keys(AZURE_DEVOPS_HANDLERS).sort()).toEqual([...paths].sort())
    for (const spec of AZURE_DEVOPS_COMMAND_SPECS) {
      expect(spec.allowedFlags).toEqual(
        expect.not.arrayContaining([expect.stringMatching(WRITES_OUT)])
      )
    }
  })

  it('tells every agent prompt not to publish or vote', () => {
    const tools = { cli: 'orca', access: 'mcp' as const }
    const review = buildAzureDevOpsReviewAgentPrompt(
      {
        ...pullRequest,
        description: '',
        isDraft: false,
        isFork: false,
        organizationKey: 'dev.azure.com/contoso',
        organizationLabel: 'contoso',
        project: 'Web',
        repositoryId: 'repo',
        repoKey: 'dev.azure.com/contoso/web/app',
        author: { displayName: 'Ada Example', uniqueName: null },
        myVote: 'none',
        createdAt: '2026-11-17T09:00:00Z',
        closedAt: null,
        webUrl: 'https://dev.azure.com/contoso/Web/_git/app/pullrequest/7'
      },
      tools
    )
    const rework = buildAzureDevOpsDraftReworkPrompt({
      pullRequest,
      cli: 'orca',
      generalInstruction: '',
      items: []
    })
    const feedback = buildAzureDevOpsFeedbackAgentPrompt({
      pullRequest,
      threads: [],
      tools,
      language: 'en',
      instruction: ''
    })

    expect(review).toContain('Do not publish, vote')
    expect(rework).toContain('Do not publish, vote')
    expect(feedback).toContain('publish or vote')
  })
})
