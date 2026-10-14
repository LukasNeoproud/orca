import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { AzureDevOpsReviewPullRequest } from '../../../src/shared/azure-devops-review-types'
import { DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS } from '../../../src/shared/azure-devops-review-options'

const { requestMock, launchMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  launchMock: vi.fn()
}))
vi.mock('./use-azure-devops-review', () => ({ azureDevOpsReviewRequest: requestMock }))
vi.mock('../session/pr-ai-triage-launch', () => ({ launchAgentWithPrompt: launchMock }))

import { launchAzureDevOpsReviewAgent } from './azure-devops-review-agent-launch'

const pullRequest: AzureDevOpsReviewPullRequest = {
  key: 'org+repo+7',
  pullRequestId: 7,
  title: 'Fix',
  description: 'Adds retries',
  status: 'active',
  isDraft: false,
  isFork: false,
  organizationKey: 'org',
  organizationLabel: 'org',
  project: 'proj',
  repository: 'app',
  repositoryId: 'repo',
  repoKey: 'org+repo',
  author: { displayName: 'Author', uniqueName: null },
  myVote: 'none',
  createdAt: '',
  closedAt: null,
  sourceBranch: 'feature',
  targetBranch: 'main',
  sourceCommit: null,
  targetCommit: null,
  webUrl: ''
}
const worktree = {
  worktreeId: 'wt',
  repoId: 'r',
  path: '/w',
  pullRequestKey: 'org+repo+7',
  commit: null
}
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every request goes through the mocked azureDevOpsReviewRequest, so the client is never touched.
const client = {} as RpcClient

function launch(confirmDiscard: () => Promise<boolean>) {
  return launchAzureDevOpsReviewAgent({
    client,
    hostCapabilities: [],
    pullRequest,
    options: DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS,
    confirmDiscard
  })
}

describe('launchAzureDevOpsReviewAgent', () => {
  beforeEach(() => {
    requestMock.mockReset()
    launchMock.mockReset()
    launchMock.mockResolvedValue({ kind: 'sent' })
  })

  it('asks before discarding changes, then starts the agent with the host-planned arguments', async () => {
    requestMock.mockImplementation(
      async (_client, method: string, params: { discardChanges?: boolean }) => {
        if (method === 'azureDevOpsReview.openWorktree') {
          return params.discardChanges
            ? { ok: true, worktree, created: false }
            : { ok: false, reason: 'dirty', message: 'dirty' }
        }
        return { agentArgs: '--mcp-config x', mcp: true, cli: 'orca-dev' }
      }
    )
    const confirm = vi.fn(async () => true)
    await expect(launch(confirm)).resolves.toEqual({ kind: 'sent', worktreeId: 'wt' })
    expect(confirm).toHaveBeenCalledOnce()

    const prepared = await launchMock.mock.calls[0][0].beforeLaunch('claude')
    expect(prepared.agentArgs).toBe('--mcp-config x')
    expect(prepared.prompt).toContain('Review Azure DevOps pull request !7 "Fix"')
    expect(requestMock).toHaveBeenLastCalledWith(client, 'azureDevOpsReview.agentLaunchArgs', {
      agent: 'claude',
      permissions: 'auto',
      surface: 'terminal'
    })
  })

  it('leaves a dirty workspace alone when the user declines', async () => {
    requestMock.mockResolvedValue({ ok: false, reason: 'dirty', message: 'dirty' })
    const result = await launch(async () => false)
    expect(result.kind).toBe('not-started')
    expect(launchMock).not.toHaveBeenCalled()
  })
})
