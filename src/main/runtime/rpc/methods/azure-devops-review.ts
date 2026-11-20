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
import { assertAzureDevOpsReviewVoteCaller } from '../../../azure-devops/review/azure-devops-review-vote-cast'
import {
  findAzureDevOpsReviewWorktree,
  openAzureDevOpsReviewWorktree,
  type AzureDevOpsReviewWorktreeHost
} from '../../../azure-devops/review/azure-devops-review-worktree'
import {
  openAzureDevOpsFeedbackWorktree,
  type AzureDevOpsFeedbackWorktreeHost
} from '../../../azure-devops/review/azure-devops-feedback-worktree'
import {
  assertAzureDevOpsReviewDepthCaller,
  azureDevOpsReviewCallerIsApp
} from '../../../azure-devops/review/azure-devops-review-worktree-execution'
import { getAzureDevOpsReviewFileDiff } from '../../../azure-devops/review/azure-devops-review-file-diff'
import { ensureAzureDevOpsReviewPiExtension } from '../../../azure-devops/review/azure-devops-review-pi-extension'
import { getAzureDevOpsReviewPullRequest } from '../../../azure-devops/review/azure-devops-review-client'
import { getQualityGateService } from '../../../quality-gates/quality-gate-host'
import { mapAzureDevOpsReviewPullRequest } from '../../../azure-devops/review/azure-devops-review-mappers'

function reviewHost(runtime: OrcaRuntimeService): AzureDevOpsReviewHost {
  return {
    listRepos: () => runtime.listRepos(),
    findReviewWorktree: findAzureDevOpsReviewWorktree,
    findGateRun: (runId) => getQualityGateService().findRun(runId)
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
    }
  }
}

function feedbackWorktreeHost(runtime: OrcaRuntimeService): AzureDevOpsFeedbackWorktreeHost {
  return {
    listWorktrees: async (repoIds) => {
      const lists = await Promise.all(
        repoIds.map((repoId) => runtime.listManagedWorktrees(`id:${repoId}`).catch(() => null))
      )
      return lists.flatMap((list) =>
        (list?.worktrees ?? []).map((worktree) => ({
          id: worktree.id,
          repoId: worktree.repoId,
          path: worktree.path,
          branch: worktree.branch,
          linkedAzureDevOpsPR: worktree.linkedAzureDevOpsPR ?? null
        }))
      )
    },
    createWorktree: async ({ repoId, name, branch, remoteRef, baseRef, pullRequestId }) => {
      const result = await runtime.createManagedWorktree({
        repoSelector: `id:${repoId}`,
        name,
        explicitCreation: {
          branch: remoteRef
            ? { kind: 'remote', name: branch, remoteRef }
            : { kind: 'local', name: branch },
          destination: { relativeDirectory: name }
        },
        linkedAzureDevOpsPR: pullRequestId,
        setupDecision: 'inherit'
      })
      await runtime.updateManagedWorktreeMeta(`id:${result.worktree.id}`, { baseRef })
      return { id: result.worktree.id, path: result.worktree.path }
    },
    linkPullRequest: async (worktreeId, pullRequestId) => {
      await runtime.updateManagedWorktreeMeta(`id:${worktreeId}`, {
        linkedAzureDevOpsPR: pullRequestId
      })
    }
  }
}

async function resolveFreshPullRequest(runtime: OrcaRuntimeService, pullRequestKey: string) {
  const resolved = await resolveAzureDevOpsReviewPullRequest(reviewHost(runtime), pullRequestKey)
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
  return { source: resolved.source, pullRequest }
}

// Why: the desktop that owns the Azure DevOps credentials answers for every client;
// there is deliberately no RPC that publishes on an agent's behalf except publishDrafts,
// which the CLI and MCP surfaces never expose and whose vote the runtime socket cannot send.
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
      listAzureDevOpsReviewPullRequests(reviewHost(runtime), params.status, params.pages)
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
    handler: async (params, { runtime, caller }) => {
      if (params.vote !== undefined) {
        assertAzureDevOpsReviewVoteCaller(caller)
      }
      return publishAzureDevOpsReviewDrafts(
        reviewHost(runtime),
        params.pullRequestKey,
        params.draftIds,
        params.vote
      )
    }
  }),
  defineMethod({
    name: 'azureDevOpsReview.openWorktree',
    permission: 'workspace',
    params: AzureDevOpsReviewOpenWorktreeParams,
    handler: async (params, { runtime, caller }) => {
      if (params.depth !== undefined) {
        assertAzureDevOpsReviewDepthCaller(caller)
      }
      const { source, pullRequest } = await resolveFreshPullRequest(runtime, params.pullRequestKey)
      const result = await openAzureDevOpsReviewWorktree({
        host: reviewWorktreeHost(runtime),
        source,
        pullRequest,
        discardChanges: params.discardChanges === true,
        depth: params.depth
      })
      const piExtensionPath = result.ok ? ensureAzureDevOpsReviewPiExtension() : null
      return piExtensionPath ? { ...result, piExtensionPath } : result
    }
  }),
  defineMethod({
    // Why separate from openWorktree: the author's branch workspace is never reset or detached.
    name: 'azureDevOpsReview.openFeedbackWorktree',
    permission: 'workspace',
    params: AzureDevOpsReviewKeyParams,
    handler: async (params, { runtime }) => {
      const { source, pullRequest } = await resolveFreshPullRequest(runtime, params.pullRequestKey)
      const result = await openAzureDevOpsFeedbackWorktree({
        host: feedbackWorktreeHost(runtime),
        source,
        pullRequest
      })
      const piExtensionPath = result.ok ? ensureAzureDevOpsReviewPiExtension() : null
      return piExtensionPath ? { ...result, piExtensionPath } : result
    }
  }),
  defineMethod({
    // Why the desktop window: it owns the launch surfaces and knows the pull request's AI chat.
    name: 'azureDevOpsReview.runAgent',
    permission: 'workspace',
    params: AzureDevOpsReviewRunAgentParams,
    // Why stamped here: the window relays the request as the desktop, so it cannot tell an app
    // from the runtime socket, and only the user's own choice of depth is remembered.
    handler: async (params, { runtime, caller }) =>
      runtime.runAzureDevOpsReviewAgent({
        ...params,
        depthChosenByUser: azureDevOpsReviewCallerIsApp(caller)
      })
  })
]
