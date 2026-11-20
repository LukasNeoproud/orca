import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY
} from '../../../shared/host-feature-runtime-capabilities'
import type { AzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-options'
import type { AzureDevOpsReviewCastableVote } from '../../../shared/azure-devops-review-vote'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import type {
  AzureDevOpsFeedbackWorktreeResult,
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
  status: AzureDevOpsPullRequestStatusFilter,
  pages = 1
): Promise<AzureDevOpsReviewListResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.list',
    { status, ...(pages > 1 ? { pages } : {}) },
    { timeoutMs: LIST_TIMEOUT_MS }
  )
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

/** Posts the drafts and then, when given, the vote. Pass a vote only the user just confirmed. */
export function publishAzureDevOpsReviewDrafts(
  pullRequestKey: string,
  draftIds: string[],
  vote: AzureDevOpsReviewCastableVote | null = null
): Promise<AzureDevOpsReviewPublishResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.publishDrafts',
    { pullRequestKey, draftIds, ...(vote ? { vote } : {}) },
    { timeoutMs: LIST_TIMEOUT_MS }
  )
}

const hostCapabilities = new Set<string>()

async function hostHasCapability(capability: string): Promise<boolean> {
  if (hostCapabilities.has(capability)) {
    return true
  }
  try {
    const status = await callRuntimeRpc<RuntimeStatus>(LOCAL, 'status.get')
    for (const advertised of status.capabilities ?? []) {
      hostCapabilities.add(advertised)
    }
  } catch {
    // Unknown is treated as unsupported; the next page load asks again.
  }
  return hostCapabilities.has(capability)
}

/** Whether the host that holds the credentials reads a vote; an older one drops it silently. */
export function azureDevOpsReviewHostCastsVotes(): Promise<boolean> {
  return hostHasCapability(AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY)
}

/** Whether the host keeps a draft's severity and evidence; an older one drops both silently. */
export function azureDevOpsReviewHostKeepsFindings(): Promise<boolean> {
  return hostHasCapability(AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY)
}

/** `depth` is the user's choice for a review that is starting; without it the host keeps its own. */
export function openAzureDevOpsReviewWorktree(
  pullRequestKey: string,
  discardChanges = false,
  depth?: AzureDevOpsReviewDepth
): Promise<AzureDevOpsReviewWorktreeResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.openWorktree',
    { pullRequestKey, discardChanges, ...(depth ? { depth } : {}) },
    { timeoutMs: WORKTREE_TIMEOUT_MS }
  )
}

/** The author's workspace with the pull request's source branch, created when none has it. */
export function openAzureDevOpsFeedbackWorktree(
  pullRequestKey: string
): Promise<AzureDevOpsFeedbackWorktreeResult> {
  return callRuntimeRpc(
    LOCAL,
    'azureDevOpsReview.openFeedbackWorktree',
    { pullRequestKey },
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
