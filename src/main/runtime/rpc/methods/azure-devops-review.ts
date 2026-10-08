import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  AZURE_DEVOPS_REVIEW_THREAD_STATUSES,
  type AzureDevOpsThreadStatus
} from '../../../../shared/azure-devops-review-types'
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

const PullRequestKey = z.string().min(3).max(512)
const ThreadStatus = z
  .string()
  .refine((value) => (AZURE_DEVOPS_REVIEW_THREAD_STATUSES as readonly string[]).includes(value))
  .transform((value) => value as AzureDevOpsThreadStatus)
const Anchor = z.object({
  side: z.enum(['right', 'left']).optional().default('right'),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive().optional()
})
const NormalizedAnchor = Anchor.transform((anchor) => ({
  side: anchor.side,
  startLine: anchor.startLine,
  endLine: Math.max(anchor.startLine, anchor.endLine ?? anchor.startLine)
}))
const Author = z.union([
  z.object({ kind: z.literal('user') }),
  z.object({ kind: z.literal('agent'), label: z.string().max(120).nullable().optional() })
])

const ListParams = z
  .object({ status: z.enum(['active', 'completed', 'abandoned', 'all']).optional() })
  .nullish()
  .transform((value) => ({ status: value?.status ?? 'active' }))

const KeyParams = z.object({ pullRequestKey: PullRequestKey })

const CreateDraftParams = z.object({
  pullRequestKey: PullRequestKey,
  kind: z.enum(['inline', 'file', 'general', 'reply']),
  body: z.string().max(64_000),
  filePath: z.string().max(4096).nullable().optional(),
  anchor: NormalizedAnchor.nullable().optional(),
  threadId: z.number().int().positive().nullable().optional(),
  threadStatus: ThreadStatus.nullable().optional(),
  author: Author.optional(),
  commit: z.string().max(64).nullable().optional()
})

const UpdateDraftParams = z.object({
  id: z.string().min(1).max(128),
  patch: z.object({
    body: z.string().max(64_000).optional(),
    filePath: z.string().max(4096).nullable().optional(),
    anchor: NormalizedAnchor.nullable().optional(),
    threadStatus: ThreadStatus.nullable().optional(),
    rebaseToLatest: z.boolean().optional()
  })
})

const FileDiffParams = z.object({
  pullRequestKey: PullRequestKey,
  path: z.string().min(1).max(4096),
  originalPath: z.string().max(4096).nullable().optional()
})

const DeleteDraftParams = z.object({ id: z.string().min(1).max(128) })

const PublishParams = z.object({
  pullRequestKey: PullRequestKey,
  draftIds: z.array(z.string().min(1).max(128)).min(1).max(200)
})

const OpenWorktreeParams = z.object({
  pullRequestKey: PullRequestKey,
  discardChanges: z.boolean().optional()
})

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
export const AZURE_DEVOPS_REVIEW_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'azureDevOpsReview.repos',
    params: null,
    handler: async (_params, { runtime }) => ({
      repos: await listAzureDevOpsReviewRepos(reviewHost(runtime))
    })
  }),
  defineMethod({
    name: 'azureDevOpsReview.list',
    params: ListParams,
    handler: async (params, { runtime }) =>
      listAzureDevOpsReviewPullRequests(reviewHost(runtime), params.status)
  }),
  defineMethod({
    name: 'azureDevOpsReview.get',
    params: KeyParams,
    handler: async (params, { runtime }) =>
      getAzureDevOpsReviewDetail(reviewHost(runtime), params.pullRequestKey)
  }),
  defineMethod({
    name: 'azureDevOpsReview.fileDiff',
    params: FileDiffParams,
    handler: async (params, { runtime }) =>
      getAzureDevOpsReviewFileDiff(reviewHost(runtime), params)
  }),
  defineMethod({
    name: 'azureDevOpsReview.drafts',
    params: KeyParams,
    handler: async (params, { runtime }) =>
      listAzureDevOpsReviewDrafts(reviewHost(runtime), params.pullRequestKey)
  }),
  defineMethod({
    name: 'azureDevOpsReview.createDraft',
    params: CreateDraftParams,
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
    params: UpdateDraftParams,
    handler: async (params, { runtime }) => ({
      draft: await updateAzureDevOpsReviewDraft(reviewHost(runtime), params.id, params.patch)
    })
  }),
  defineMethod({
    name: 'azureDevOpsReview.deleteDraft',
    params: DeleteDraftParams,
    handler: async (params) => deleteAzureDevOpsReviewDraft(params.id)
  }),
  defineMethod({
    name: 'azureDevOpsReview.publishDrafts',
    params: PublishParams,
    handler: async (params, { runtime }) =>
      publishAzureDevOpsReviewDrafts(reviewHost(runtime), params.pullRequestKey, params.draftIds)
  }),
  defineMethod({
    name: 'azureDevOpsReview.openWorktree',
    params: OpenWorktreeParams,
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
  })
]
