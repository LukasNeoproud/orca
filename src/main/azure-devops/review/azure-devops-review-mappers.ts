import {
  azureDevOpsPullRequestKey,
  type AzureDevOpsLineAnchor,
  type AzureDevOpsPullRequestStatus,
  type AzureDevOpsReviewChange,
  type AzureDevOpsReviewChangeType,
  type AzureDevOpsReviewIdentity,
  type AzureDevOpsReviewIteration,
  type AzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewRepo,
  type AzureDevOpsReviewThread,
  type AzureDevOpsReviewVote,
  type AzureDevOpsThreadStatus
} from '../../../shared/azure-devops-review-types'

type RawIdentity = {
  id?: string | null
  displayName?: string | null
  uniqueName?: string | null
  vote?: number | null
}

export type RawReviewPullRequest = {
  pullRequestId?: number | null
  title?: string | null
  description?: string | null
  status?: string | null
  isDraft?: boolean | null
  creationDate?: string | null
  closedDate?: string | null
  sourceRefName?: string | null
  targetRefName?: string | null
  createdBy?: RawIdentity | null
  reviewers?: RawIdentity[] | null
  lastMergeSourceCommit?: { commitId?: string | null } | null
  lastMergeTargetCommit?: { commitId?: string | null } | null
  forkSource?: unknown
  repository?: { id?: string | null; name?: string | null; webUrl?: string | null } | null
}

type RawThreadPosition = { line?: number | null; offset?: number | null } | null

export type RawReviewThread = {
  id?: number | null
  status?: string | number | null
  isDeleted?: boolean | null
  threadContext?: {
    filePath?: string | null
    rightFileStart?: RawThreadPosition
    rightFileEnd?: RawThreadPosition
    leftFileStart?: RawThreadPosition
    leftFileEnd?: RawThreadPosition
  } | null
  comments?:
    | {
        id?: number | null
        parentCommentId?: number | null
        author?: RawIdentity | null
        content?: string | null
        publishedDate?: string | null
        commentType?: string | number | null
        isDeleted?: boolean | null
      }[]
    | null
}

export type RawIterationChange = {
  changeTrackingId?: number | null
  changeType?: string | null
  item?: { path?: string | null } | null
  originalPath?: string | null
  sourceServerItem?: string | null
}

export type RawIteration = {
  id?: number | null
  sourceRefCommit?: { commitId?: string | null } | null
  targetRefCommit?: { commitId?: string | null } | null
  commonRefCommit?: { commitId?: string | null } | null
}

export function mapAzureDevOpsReviewVote(vote: number | null | undefined): AzureDevOpsReviewVote {
  switch (vote) {
    case 10:
      return 'approved'
    case 5:
      return 'approved-with-suggestions'
    case -5:
      return 'waiting-for-author'
    case -10:
      return 'rejected'
    case null:
    case undefined:
    default:
      return 'none'
  }
}

function mapStatus(status: string | null | undefined): AzureDevOpsPullRequestStatus {
  const normalized = status?.trim().toLowerCase()
  return normalized === 'completed' || normalized === 'abandoned' ? normalized : 'active'
}

function mapIdentity(raw: RawIdentity | null | undefined): AzureDevOpsReviewIdentity {
  return {
    displayName: raw?.displayName?.trim() || raw?.uniqueName?.trim() || 'Unknown',
    uniqueName: raw?.uniqueName?.trim() || null
  }
}

export function stripRefsHeads(ref: string | null | undefined): string {
  return (ref ?? '').replace(/^refs\/heads\//, '')
}

/** ADO item paths are rooted (`/src/a.ts`); Orca keeps repo-relative paths. */
export function toRepoRelativePath(path: string | null | undefined): string | null {
  const trimmed = path?.trim()
  return trimmed ? trimmed.replace(/^\/+/, '') : null
}

export function toAzureDevOpsItemPath(path: string): string {
  return `/${path.replace(/^\/+/, '')}`
}

export function mapAzureDevOpsReviewPullRequest(
  raw: RawReviewPullRequest,
  context: {
    repo: AzureDevOpsReviewRepo
    repositoryId: string
    repositoryWebUrl: string
    meId: string | null
  }
): AzureDevOpsReviewPullRequest | null {
  const pullRequestId = raw.pullRequestId
  if (typeof pullRequestId !== 'number' || !Number.isInteger(pullRequestId)) {
    return null
  }
  const me = context.meId?.toLowerCase()
  const myReview = me ? raw.reviewers?.find((reviewer) => reviewer.id?.toLowerCase() === me) : null
  return {
    key: azureDevOpsPullRequestKey(
      context.repo.organizationKey,
      context.repositoryId,
      pullRequestId
    ),
    pullRequestId,
    title: raw.title?.trim() || `Pull request ${pullRequestId}`,
    description: raw.description ?? '',
    status: mapStatus(raw.status),
    isDraft: raw.isDraft === true,
    isFork: raw.forkSource != null,
    organizationKey: context.repo.organizationKey,
    organizationLabel: context.repo.organizationLabel,
    project: context.repo.project,
    repository: context.repo.repository,
    repositoryId: context.repositoryId,
    repoKey: context.repo.key,
    author: mapIdentity(raw.createdBy),
    myVote: mapAzureDevOpsReviewVote(myReview?.vote),
    ...(me && raw.createdBy?.id?.toLowerCase() === me ? { createdByMe: true as const } : {}),
    createdAt: raw.creationDate ?? '',
    closedAt: raw.closedDate ?? null,
    sourceBranch: stripRefsHeads(raw.sourceRefName),
    targetBranch: stripRefsHeads(raw.targetRefName),
    sourceCommit: raw.lastMergeSourceCommit?.commitId?.trim() || null,
    targetCommit: raw.lastMergeTargetCommit?.commitId?.trim() || null,
    webUrl: `${context.repositoryWebUrl.replace(/\/+$/, '')}/pullrequest/${pullRequestId}`
  }
}

const THREAD_STATUS_BY_NUMBER: Record<number, AzureDevOpsThreadStatus> = {
  1: 'active',
  2: 'fixed',
  3: 'wontFix',
  4: 'closed',
  5: 'byDesign',
  6: 'pending'
}

export function mapAzureDevOpsThreadStatus(
  status: string | number | null | undefined
): AzureDevOpsThreadStatus {
  if (typeof status === 'number') {
    return THREAD_STATUS_BY_NUMBER[status] ?? 'unknown'
  }
  switch (status?.trim()) {
    case 'active':
    case 'fixed':
    case 'wontFix':
    case 'closed':
    case 'byDesign':
    case 'pending':
      return status.trim() as AzureDevOpsThreadStatus
    case undefined:
    default:
      return 'unknown'
  }
}

function lineOf(position: RawThreadPosition | undefined): number | null {
  const line = position?.line
  return typeof line === 'number' && line > 0 ? line : null
}

function mapAnchor(context: RawReviewThread['threadContext']): AzureDevOpsLineAnchor | null {
  const rightStart = lineOf(context?.rightFileStart)
  if (rightStart !== null) {
    return {
      side: 'right',
      startLine: rightStart,
      endLine: lineOf(context?.rightFileEnd) ?? rightStart
    }
  }
  const leftStart = lineOf(context?.leftFileStart)
  if (leftStart !== null) {
    return {
      side: 'left',
      startLine: leftStart,
      endLine: lineOf(context?.leftFileEnd) ?? leftStart
    }
  }
  return null
}

function isSystemComment(commentType: string | number | null | undefined): boolean {
  return commentType === 'system' || commentType === 2 || commentType === 'codeChange'
}

/** Drops deleted threads and system-only threads (votes, policy and push notices). */
export function mapAzureDevOpsReviewThread(raw: RawReviewThread): AzureDevOpsReviewThread | null {
  if (typeof raw.id !== 'number' || raw.isDeleted === true) {
    return null
  }
  const comments = (raw.comments ?? [])
    .filter((comment) => comment.isDeleted !== true && typeof comment.id === 'number')
    .map((comment) => ({
      id: comment.id as number,
      parentCommentId: comment.parentCommentId ?? 0,
      author: mapIdentity(comment.author),
      content: comment.content ?? '',
      publishedAt: comment.publishedDate ?? null,
      isSystem: isSystemComment(comment.commentType)
    }))
  // Why: every() is true for an empty list, so this also drops comment-less threads.
  if (comments.every((comment) => comment.isSystem)) {
    return null
  }
  return {
    id: raw.id,
    status: mapAzureDevOpsThreadStatus(raw.status),
    filePath: toRepoRelativePath(raw.threadContext?.filePath),
    anchor: mapAnchor(raw.threadContext),
    comments
  }
}

function mapChangeType(changeType: string | null | undefined): AzureDevOpsReviewChangeType {
  const parts = (changeType ?? '')
    .toLowerCase()
    .split(',')
    .map((part) => part.trim())
  if (parts.includes('rename')) {
    return 'rename'
  }
  if (parts.includes('add')) {
    return 'add'
  }
  if (parts.includes('delete')) {
    return 'delete'
  }
  return parts.includes('edit') ? 'edit' : 'other'
}

export function mapAzureDevOpsReviewChange(
  raw: RawIterationChange
): AzureDevOpsReviewChange | null {
  const path = toRepoRelativePath(raw.item?.path)
  if (!path) {
    return null
  }
  return {
    path,
    originalPath: toRepoRelativePath(raw.originalPath ?? raw.sourceServerItem),
    changeType: mapChangeType(raw.changeType),
    changeTrackingId: typeof raw.changeTrackingId === 'number' ? raw.changeTrackingId : null
  }
}

export function mapAzureDevOpsReviewIteration(
  raw: RawIteration
): AzureDevOpsReviewIteration | null {
  if (typeof raw.id !== 'number') {
    return null
  }
  return {
    id: raw.id,
    sourceCommit: raw.sourceRefCommit?.commitId?.trim() || null,
    targetCommit: raw.targetRefCommit?.commitId?.trim() || null,
    baseCommit: raw.commonRefCommit?.commitId?.trim() || null
  }
}
