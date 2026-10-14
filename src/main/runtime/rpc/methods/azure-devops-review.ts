import {
  AzureDevOpsReviewListParams,
  AzureDevOpsReviewKeyParams,
  AzureDevOpsReviewCreateDraftParams,
  AzureDevOpsReviewUpdateDraftParams,
  AzureDevOpsReviewFileDiffParams,
  AzureDevOpsReviewDeleteDraftParams,
  AzureDevOpsReviewPublishParams,
  AzureDevOpsReviewOpenWorktreeParams,
  AzureDevOpsReviewRunAgentParams
} from '../../../../shared/rpc-contract/azure-devops-review-params'
import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  getAzureDevOpsReviewDetail,
  listAzureDevOpsReviewPullRequests,
  listAzureDevOpsReviewRepos,
  resolveAzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewHost
} from '../../../azure-devops/review/azure-devops-review-service'
import {
  createAzureDevOpsReviewDraft,
  deleteAzureDevOpsReviewDraft,
  listAzureDevOpsReviewDrafts,
  publishAzureDevOpsReviewDrafts,
  updateAzureDevOpsReviewDraft
} from '../../../azure-devops/review/azure-devops-review-draft-actions'
import {
  findAzureDevOpsReviewWorktree,
  openAzureDevOpsReviewWorktree,
  type AzureDevOpsReviewWorktreeHost
} from '../../../azure-devops/review/azure-devops-review-worktree'
import { getAzureDevOpsReviewFileDiff } from '../../../azure-devops/review/azure-devops-review-file-diff'
import { getAzureDevOpsReviewPullRequest } from '../../../azure-devops/review/azure-devops-review-client'
import { mapAzureDevOpsReviewPullRequest } from '../../../azure-devops/review/azure-devops-review-mappers'

const WORKTREE_PS_SCAN_LIMIT = 5_000

function reviewHost(runtime: OrcaRuntimeService): AzureDevOpsReviewHost {
  return {
    listRepos: () => runtime.listRepos(),
    findReviewWorktree: findAzureDevOpsReviewWorktree
  }
}

function reviewWorktreeHost(runtime: OrcaRuntimeService): AzureDevOpsReviewWorktreeHost {
  return {
    createWorktree: async ({ repoId, name, baseBranch }) => {
      const result = await runtime.createManagedWorktree({
        repoSelector: `id:${repoId}`,
        name,
        baseBranch,
        setupDecision: 'inherit'
      })
      return {
        id: result.worktree.id,
        path: result.worktree.path,
        branch: result.worktree.branch ?? ''
      }
    },
    findWorktree: async (worktreeId) => {
      try {
        const worktree = await runtime.showManagedWorktree(`id:${worktreeId}`)
        return { id: worktree.id, path: worktree.path }
      } catch {
        return null
      }
    },
    updateWorktree: async (worktreeId, updates) => {
      await runtime.updateManagedWorktreeMeta(`id:${worktreeId}`, {
        ...updates,
        displayNameIsPinned: true
      })
    },
    isAgentWorking: async (worktreeId) => {
      const ps = await runtime.getWorktreePs(WORKTREE_PS_SCAN_LIMIT)
      const row = ps.worktrees.find((candidate) => candidate.worktreeId === worktreeId)
      return row?.status === 'working' || row?.status === 'permission'
    }
  }
}

// Why: the desktop that owns the Azure DevOps credentials answers for every client;
// there is deliberately no RPC that publishes on an agent's behalf except publishDrafts,
// which the CLI and MCP surfaces never expose.
export const AZURE_DEVOPS_REVIEW_METHODS = [
  defineMethod({
    name: 'azureDevOpsReview.repos',
    permission: 'workspace',
    params: null,
    handler: async (_params, { runtime }) => ({
      repos: await listAzureDevOpsReviewRepos(reviewHost(runtime))
    })
  }),
  defineMethod({
    name: 'azureDevOpsReview.list',
    permission: 'workspace',
    params: AzureDevOpsReviewListParams,
    handler: async (params, { runtime }) =>
      listAzureDevOpsReviewPullRequests(reviewHost(runtime), params.status)
  }),
  defineMethod({
    name: 'azureDevOpsReview.get',
    permission: 'workspace',
    params: AzureDevOpsReviewKeyParams,
    handler: async (params, { runtime }) =>
      getAzureDevOpsReviewDetail(reviewHost(runtime), params.pullRequestKey)
  }),
  defineMethod({
    name: 'azureDevOpsReview.fileDiff',
    permission: 'workspace',
    params: AzureDevOpsReviewFileDiffParams,
    handler: async (params, { runtime }) =>
      getAzureDevOpsReviewFileDiff(reviewHost(runtime), params)
  }),
  defineMethod({
    name: 'azureDevOpsReview.drafts',
    permission: 'workspace',
    params: AzureDevOpsReviewKeyParams,
    handler: async (params, { runtime }) =>
      listAzureDevOpsReviewDrafts(reviewHost(runtime), params.pullRequestKey)
  }),
  defineMethod({
    name: 'azureDevOpsReview.createDraft',
    permission: 'workspace',
    params: AzureDevOpsReviewCreateDraftParams,
    handler: async (params, { runtime }) => ({
      draft: await createAzureDevOpsReviewDraft(reviewHost(runtime), {
        ...params,
        author:
          params.author?.kind === 'agent'
            ? { kind: 'agent', label: params.author.label ?? null }
            : { kind: 'user' }
      })
    })
  }),
  defineMethod({
    name: 'azureDevOpsReview.updateDraft',
    permission: 'workspace',
    params: AzureDevOpsReviewUpdateDraftParams,
    handler: async (params, { runtime }) => ({
      draft: await updateAzureDevOpsReviewDraft(reviewHost(runtime), params.id, params.patch)
    })
  }),
  defineMethod({
    name: 'azureDevOpsReview.deleteDraft',
    permission: 'workspace',
    params: AzureDevOpsReviewDeleteDraftParams,
    handler: async (params) => deleteAzureDevOpsReviewDraft(params.id)
  }),
  defineMethod({
    name: 'azureDevOpsReview.publishDrafts',
    permission: 'workspace',
    params: AzureDevOpsReviewPublishParams,
    handler: async (params, { runtime }) =>
      publishAzureDevOpsReviewDrafts(reviewHost(runtime), params.pullRequestKey, params.draftIds)
  }),
  defineMethod({
    name: 'azureDevOpsReview.openWorktree',
    permission: 'workspace',
    params: AzureDevOpsReviewOpenWorktreeParams,
    handler: async (params, { runtime }) => {
      const host = reviewHost(runtime)
      const resolved = await resolveAzureDevOpsReviewPullRequest(host, params.pullRequestKey)
      const pullRequest = mapAzureDevOpsReviewPullRequest(
        await getAzureDevOpsReviewPullRequest(resolved.target),
        {
          repo: resolved.source,
          repositoryId: resolved.target.repositoryId,
          repositoryWebUrl: resolved.repositoryWebUrl,
          meId: null
        }
      )
      if (!pullRequest) {
        throw new Error('Azure DevOps returned an unreadable pull request.')
      }
      return openAzureDevOpsReviewWorktree({
        host: reviewWorktreeHost(runtime),
        source: resolved.source,
        pullRequest,
        discardChanges: params.discardChanges === true
      })
    }
  }),
  defineMethod({
    // Why the desktop window: it owns the launch surfaces and knows the pull request's AI chat.
    name: 'azureDevOpsReview.runAgent',
    permission: 'workspace',
    params: AzureDevOpsReviewRunAgentParams,
    handler: async (params, { runtime }) => runtime.runAzureDevOpsReviewAgent(params)
  })
]
