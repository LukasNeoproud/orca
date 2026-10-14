// Azure DevOps pull request review: wire types shared by the host runtime,
// the desktop renderer, the paired mobile client and the `orca ado` CLI.

export type AzureDevOpsConnection = {
  id: string
  /** Lowercased org URL without protocol, e.g. `dev.azure.com/contoso`. */
  organizationKey: string
  organizationUrl: string
  label: string
  createdAt: number
}

export type AzureDevOpsConnectionView = AzureDevOpsConnection & {
  credentialError: string | null
}

export type AzureDevOpsDetectedOrganization = {
  organizationKey: string
  organizationUrl: string
  label: string
  repoCount: number
  credentialSource: 'connection' | 'environment' | null
}

export type AzureDevOpsConnectionsStatus = {
  connections: AzureDevOpsConnectionView[]
  detected: AzureDevOpsDetectedOrganization[]
  environmentConfigured: boolean
}

export type AzureDevOpsConnectInput = {
  organizationUrl: string
  label?: string
  /** Personal access token scoped to this organization. */
  token: string
}

export type AzureDevOpsConnectResult =
  | { ok: true; connection: AzureDevOpsConnectionView; account: string | null }
  | { ok: false; error: string }

/** An Azure Repos repository that has at least one local (non-SSH) clone in Orca. */
export type AzureDevOpsReviewRepo = {
  /** `${organizationKey}/${project}/${repository}`, lowercased. */
  key: string
  organizationKey: string
  organizationUrl: string
  organizationLabel: string
  project: string
  repository: string
  orcaRepoIds: string[]
}

export type AzureDevOpsPullRequestStatus = 'active' | 'completed' | 'abandoned'
export type AzureDevOpsPullRequestStatusFilter = AzureDevOpsPullRequestStatus | 'all'

export type AzureDevOpsReviewVote =
  | 'approved'
  | 'approved-with-suggestions'
  | 'none'
  | 'waiting-for-author'
  | 'rejected'

export type AzureDevOpsReviewIdentity = {
  displayName: string
  uniqueName: string | null
}

export type AzureDevOpsReviewPullRequest = {
  /** `${organizationKey}+${repositoryId}+${pullRequestId}` — stable across clones. */
  key: string
  pullRequestId: number
  title: string
  description: string
  status: AzureDevOpsPullRequestStatus
  isDraft: boolean
  isFork: boolean
  organizationKey: string
  organizationLabel: string
  project: string
  repository: string
  repositoryId: string
  repoKey: string
  author: AzureDevOpsReviewIdentity
  myVote: AzureDevOpsReviewVote
  /** Absent when the author is someone else or the signed-in identity is unknown. */
  createdByMe?: true
  createdAt: string
  closedAt: string | null
  sourceBranch: string
  targetBranch: string
  sourceCommit: string | null
  targetCommit: string | null
  webUrl: string
}

export type AzureDevOpsReviewListError = {
  scope: string
  message: string
}

export type AzureDevOpsReviewListParams = {
  status?: AzureDevOpsPullRequestStatusFilter
}

export type AzureDevOpsReviewListResult = {
  pullRequests: AzureDevOpsReviewPullRequest[]
  repos: AzureDevOpsReviewRepo[]
  errors: AzureDevOpsReviewListError[]
  /** Unpublished draft counts keyed by pull request key. */
  draftCounts: Record<string, number>
  fetchedAt: number
}

export type AzureDevOpsThreadStatus =
  | 'active'
  | 'fixed'
  | 'wontFix'
  | 'closed'
  | 'byDesign'
  | 'pending'
  | 'unknown'

export type AzureDevOpsLineSide = 'right' | 'left'

export type AzureDevOpsLineAnchor = {
  side: AzureDevOpsLineSide
  startLine: number
  endLine: number
}

export type AzureDevOpsReviewThreadComment = {
  id: number
  parentCommentId: number
  author: AzureDevOpsReviewIdentity
  content: string
  publishedAt: string | null
  isSystem: boolean
}

export type AzureDevOpsReviewThread = {
  id: number
  status: AzureDevOpsThreadStatus
  filePath: string | null
  anchor: AzureDevOpsLineAnchor | null
  comments: AzureDevOpsReviewThreadComment[]
}

export type AzureDevOpsReviewChangeType = 'add' | 'edit' | 'delete' | 'rename' | 'other'

export type AzureDevOpsReviewChange = {
  path: string
  originalPath: string | null
  changeType: AzureDevOpsReviewChangeType
  changeTrackingId: number | null
}

export type AzureDevOpsReviewIteration = {
  id: number
  sourceCommit: string | null
  targetCommit: string | null
  /** Merge base of source and target: the "before" side of the PR's Files view. */
  baseCommit: string | null
}

export type AzureDevOpsReviewFileDiffParams = {
  pullRequestKey: string
  path: string
  originalPath?: string | null
}

export type AzureDevOpsReviewFileSide = {
  content: string
  /** Missing on this side (added or deleted file). */
  missing: boolean
  binary: boolean
  tooLarge: boolean
  /** Set on a binary image side; `content` then holds its bytes as base64. */
  imageMimeType?: string
}

export type AzureDevOpsReviewFileDiff = {
  iterationId: number
  original: AzureDevOpsReviewFileSide
  modified: AzureDevOpsReviewFileSide
}

export type AzureDevOpsReviewDraftKind = 'inline' | 'file' | 'general' | 'reply'

export type AzureDevOpsReviewDraftAuthor =
  | { kind: 'user' }
  | { kind: 'agent'; label: string | null }

export type AzureDevOpsReviewDraftState = 'draft' | 'published' | 'failed'

export type AzureDevOpsReviewDraft = {
  id: string
  pullRequestKey: string
  kind: AzureDevOpsReviewDraftKind
  /** inline/file drafts. */
  filePath: string | null
  /** inline drafts. */
  anchor: AzureDevOpsLineAnchor | null
  /** reply drafts. */
  threadId: number | null
  /** reply drafts: thread status to set together with the reply. */
  threadStatus: AzureDevOpsThreadStatus | null
  body: string
  author: AzureDevOpsReviewDraftAuthor
  /** Iteration and source commit the draft was written against. */
  iterationId: number | null
  commit: string | null
  state: AzureDevOpsReviewDraftState
  publishError: string | null
  publishedThreadId: number | null
  createdAt: number
  updatedAt: number
}

export type AzureDevOpsReviewDraftView = AzureDevOpsReviewDraft & {
  /** Written against an older iteration than the pull request's latest. */
  outdated: boolean
}

export type AzureDevOpsReviewDraftCreateInput = {
  pullRequestKey: string
  kind: AzureDevOpsReviewDraftKind
  body: string
  filePath?: string | null
  anchor?: AzureDevOpsLineAnchor | null
  threadId?: number | null
  threadStatus?: AzureDevOpsThreadStatus | null
  author?: AzureDevOpsReviewDraftAuthor
  /** Defaults to the latest iteration (and its source commit). */
  commit?: string | null
}

export type AzureDevOpsReviewDraftPatch = {
  body?: string
  filePath?: string | null
  anchor?: AzureDevOpsLineAnchor | null
  threadStatus?: AzureDevOpsThreadStatus | null
  /** Re-anchor to the latest iteration so an outdated draft becomes publishable. */
  rebaseToLatest?: boolean
}

export type AzureDevOpsReviewWorktreeInfo = {
  worktreeId: string
  /** Orca project the worktree belongs to. */
  repoId: string
  path: string
  pullRequestKey: string | null
  commit: string | null
}

export type AzureDevOpsReviewDetail = {
  pullRequest: AzureDevOpsReviewPullRequest
  latestIteration: AzureDevOpsReviewIteration | null
  threads: AzureDevOpsReviewThread[]
  changes: AzureDevOpsReviewChange[]
  drafts: AzureDevOpsReviewDraftView[]
  reviewWorktree: AzureDevOpsReviewWorktreeInfo | null
}

export type AzureDevOpsReviewPublishResult = {
  results: { draftId: string; ok: boolean; error: string | null }[]
}

export type AzureDevOpsReviewWorktreeResult =
  | { ok: true; worktree: AzureDevOpsReviewWorktreeInfo; created: boolean }
  | {
      ok: false
      reason: 'fork' | 'no-local-repo' | 'dirty' | 'busy' | 'git-failed'
      message: string
    }

// Why `+`: keys are passed to `orca ado` on the command line, so the separator must
// need no shell quoting and cannot appear in an org URL key, a repo GUID or a PR id.
const KEY_SEPARATOR = '+'

export function azureDevOpsPullRequestKey(
  organizationKey: string,
  repositoryId: string,
  pullRequestId: number
): string {
  return [organizationKey, repositoryId.toLowerCase(), pullRequestId].join(KEY_SEPARATOR)
}

export function parseAzureDevOpsPullRequestKey(
  key: string
): { organizationKey: string; repositoryId: string; pullRequestId: number } | null {
  const idIndex = key.lastIndexOf(KEY_SEPARATOR)
  const repoIndex = idIndex > 0 ? key.lastIndexOf(KEY_SEPARATOR, idIndex - 1) : -1
  if (repoIndex <= 0) {
    return null
  }
  const organizationKey = key.slice(0, repoIndex)
  const repositoryId = key.slice(repoIndex + 1, idIndex)
  const pullRequestId = Number(key.slice(idIndex + 1))
  if (!organizationKey || !repositoryId || !Number.isInteger(pullRequestId) || pullRequestId <= 0) {
    return null
  }
  return { organizationKey, repositoryId, pullRequestId }
}

export const AZURE_DEVOPS_REVIEW_THREAD_STATUSES: readonly AzureDevOpsThreadStatus[] = [
  'active',
  'fixed',
  'wontFix',
  'closed',
  'byDesign',
  'pending'
]
