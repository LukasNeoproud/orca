import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  AzureDevOpsPullRequestStatusFilter,
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftCreateInput,
  AzureDevOpsReviewDraftPatch,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewFileDiff,
  AzureDevOpsReviewFileDiffParams,
  AzureDevOpsReviewListResult,
  AzureDevOpsReviewPublishResult,
  AzureDevOpsReviewWorktreeResult
} from '../../../shared/azure-devops-review-types'

// Why local: the desktop owns the Azure DevOps credentials and the review worktrees.
const LOCAL = { kind: 'local' } as const
const LIST_TIMEOUT_MS = 60_000
const WORKTREE_TIMEOUT_MS = 180_000

export function listAzureDevOpsReviewPullRequests(
  status: AzureDevOpsPullRequestStatusFilter
): Promise<AzureDevOpsReviewListResult> {
  return callRuntimeRpc(LOCAL, 'azureDevOpsReview.list', { status }, { timeoutMs: LIST_TIMEOUT_MS })
}

export function getAzureDevOpsReviewDetail(
  pullRequestKey: string
): Promise<AzureDevOpsReviewDetail> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.get',
    { pullRequestKey },
    { timeoutMs: LIST_TIMEOUT_MS }
  )
}

export async function createAzureDevOpsReviewDraft(
  input: AzureDevOpsReviewDraftCreateInput
): Promise<AzureDevOpsReviewDraftView> {
  const result = await callRuntimeRpc<{ draft: AzureDevOpsReviewDraftView }>(
    LOCAL,
    'azureDevOpsReview.createDraft',
    { ...input, author: { kind: 'user' } }
  )
  return result.draft
}

export async function updateAzureDevOpsReviewDraft(
  id: string,
  patch: AzureDevOpsReviewDraftPatch
): Promise<AzureDevOpsReviewDraftView> {
  const result = await callRuntimeRpc<{ draft: AzureDevOpsReviewDraftView }>(
    LOCAL,
    'azureDevOpsReview.updateDraft',
    { id, patch }
  )
  return result.draft
}

export async function deleteAzureDevOpsReviewDraft(id: string): Promise<void> {
  await callRuntimeRpc(LOCAL, 'azureDevOpsReview.deleteDraft', { id })
}

export function publishAzureDevOpsReviewDrafts(
  pullRequestKey: string,
  draftIds: string[]
): Promise<AzureDevOpsReviewPublishResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.publishDrafts',
    { pullRequestKey, draftIds },
    { timeoutMs: LIST_TIMEOUT_MS }
  )
}

export function openAzureDevOpsReviewWorktree(
  pullRequestKey: string,
  discardChanges = false
): Promise<AzureDevOpsReviewWorktreeResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.openWorktree',
    { pullRequestKey, discardChanges },
    { timeoutMs: WORKTREE_TIMEOUT_MS }
  )
}

export function getAzureDevOpsReviewFileDiff(
  params: AzureDevOpsReviewFileDiffParams
): Promise<AzureDevOpsReviewFileDiff> {
  return callRuntimeRpc(LOCAL, 'azureDevOpsReview.fileDiff', params, {
    timeoutMs: LIST_TIMEOUT_MS
  })
}
