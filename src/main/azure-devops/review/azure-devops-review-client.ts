import {
  AzureDevOpsRequestError,
  sendAzureDevOpsBinaryRequest,
  sendAzureDevOpsRequest
} from '../azure-devops-api-request'
import type { AzureDevOpsPullRequestStatusFilter } from '../../../shared/azure-devops-review-types'
import type {
  RawIteration,
  RawIterationChange,
  RawReviewPullRequest,
  RawReviewThread
} from './azure-devops-review-mappers'

const IDENTITY_TTL_MS = 60 * 60_000
const LIST_TOP = 100

type CachedIdentity = { id: string; displayName: string | null; at: number }
const identityCache = new Map<string, CachedIdentity>()
const repositoryCache = new Map<string, { id: string; webUrl: string }>()

/** Clears per-organization caches after credentials change. */
export function forgetAzureDevOpsReviewOrganization(organizationKey: string): void {
  identityCache.delete(organizationKey)
  for (const key of repositoryCache.keys()) {
    if (key.startsWith(`${organizationKey}/`)) {
      repositoryCache.delete(key)
    }
  }
}

export type AzureDevOpsReviewTarget = {
  organizationKey: string
  organizationUrl: string
  project: string
}

function projectBase(target: AzureDevOpsReviewTarget): string {
  return `${target.organizationUrl.replace(/\/+$/, '')}/${encodeURIComponent(target.project)}`
}

function segment(value: string | number): string {
  return encodeURIComponent(String(value))
}

export async function getAzureDevOpsReviewIdentity(target: {
  organizationKey: string
  organizationUrl: string
}): Promise<CachedIdentity> {
  const cached = identityCache.get(target.organizationKey)
  if (cached && Date.now() - cached.at < IDENTITY_TTL_MS) {
    return cached
  }
  const data = await sendAzureDevOpsRequest<{
    authenticatedUser?: {
      id?: string | null
      providerDisplayName?: string | null
      customDisplayName?: string | null
    } | null
  }>(target.organizationUrl, '/_apis/connectionData')
  const id = data.authenticatedUser?.id?.trim()
  // Why: anonymous access still returns connectionData, with the well-known anonymous id.
  if (!id || id === 'aa442ccd-ffc1-4ab8-b30c-b5a4c0e3e5b5') {
    throw new Error('Azure DevOps did not accept the credentials for this organization.')
  }
  const identity = {
    id,
    displayName:
      data.authenticatedUser?.customDisplayName ??
      data.authenticatedUser?.providerDisplayName ??
      null,
    at: Date.now()
  }
  identityCache.set(target.organizationKey, identity)
  return identity
}

export async function resolveAzureDevOpsReviewRepository(
  target: AzureDevOpsReviewTarget & { repoKey: string; repository: string }
): Promise<{ id: string; webUrl: string }> {
  const cached = repositoryCache.get(target.repoKey)
  if (cached) {
    return cached
  }
  const raw = await sendAzureDevOpsRequest<{ id?: string | null; webUrl?: string | null }>(
    projectBase(target),
    `/_apis/git/repositories/${segment(target.repository)}`
  )
  const id = raw.id?.trim()
  if (!id) {
    throw new Error(`Azure DevOps did not return an id for ${target.repository}.`)
  }
  const resolved = {
    id: id.toLowerCase(),
    webUrl: raw.webUrl ?? `${projectBase(target)}/_git/${encodeURIComponent(target.repository)}`
  }
  repositoryCache.set(target.repoKey, resolved)
  return resolved
}

export function peekAzureDevOpsReviewRepositoryId(repoKey: string): string | null {
  return repositoryCache.get(repoKey)?.id ?? null
}

export async function listAzureDevOpsReviewerPullRequests(
  target: AzureDevOpsReviewTarget & { repositoryId: string; reviewerId: string },
  status: AzureDevOpsPullRequestStatusFilter
): Promise<RawReviewPullRequest[]> {
  const data = await sendAzureDevOpsRequest<{ value?: RawReviewPullRequest[] }>(
    projectBase(target),
    `/_apis/git/repositories/${segment(target.repositoryId)}/pullrequests`,
    {
      searchParams: {
        'searchCriteria.reviewerId': target.reviewerId,
        'searchCriteria.status': status,
        $top: LIST_TOP
      },
      timeoutMs: 15_000
    }
  )
  return data.value ?? []
}

function pullRequestPath(repositoryId: string, pullRequestId: number): string {
  return `/_apis/git/repositories/${segment(repositoryId)}/pullRequests/${segment(pullRequestId)}`
}

export type AzureDevOpsPullRequestTarget = AzureDevOpsReviewTarget & {
  repositoryId: string
  pullRequestId: number
}

export function getAzureDevOpsReviewPullRequest(
  target: AzureDevOpsPullRequestTarget
): Promise<RawReviewPullRequest> {
  return sendAzureDevOpsRequest(
    projectBase(target),
    pullRequestPath(target.repositoryId, target.pullRequestId)
  )
}

export async function listAzureDevOpsReviewIterations(
  target: AzureDevOpsPullRequestTarget
): Promise<RawIteration[]> {
  const data = await sendAzureDevOpsRequest<{ value?: RawIteration[] }>(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/iterations`
  )
  return data.value ?? []
}

export async function listAzureDevOpsReviewIterationChanges(
  target: AzureDevOpsPullRequestTarget,
  iterationId: number
): Promise<RawIterationChange[]> {
  const data = await sendAzureDevOpsRequest<{ changeEntries?: RawIterationChange[] }>(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/iterations/${segment(
      iterationId
    )}/changes`,
    // Why: $compareTo=0 diffs against the merge base, matching the PR's Files view.
    { searchParams: { $compareTo: 0, $top: 2000 }, timeoutMs: 15_000 }
  )
  return data.changeEntries ?? []
}

export async function listAzureDevOpsReviewThreads(
  target: AzureDevOpsPullRequestTarget
): Promise<RawReviewThread[]> {
  const data = await sendAzureDevOpsRequest<{ value?: RawReviewThread[] }>(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/threads`,
    { timeoutMs: 15_000 }
  )
  return data.value ?? []
}

export async function createAzureDevOpsReviewThread(
  target: AzureDevOpsPullRequestTarget,
  payload: Record<string, unknown>
): Promise<{ id: number | null }> {
  const created = await sendAzureDevOpsRequest<{ id?: number | null }>(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/threads`,
    { method: 'POST', body: payload, timeoutMs: 15_000 }
  )
  return { id: typeof created.id === 'number' ? created.id : null }
}

export async function createAzureDevOpsReviewReply(
  target: AzureDevOpsPullRequestTarget,
  threadId: number,
  content: string,
  parentCommentId: number
): Promise<void> {
  await sendAzureDevOpsRequest(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/threads/${segment(
      threadId
    )}/comments`,
    { method: 'POST', body: { content, parentCommentId, commentType: 1 }, timeoutMs: 15_000 }
  )
}

export async function updateAzureDevOpsReviewThreadStatus(
  target: AzureDevOpsPullRequestTarget,
  threadId: number,
  status: number
): Promise<void> {
  await sendAzureDevOpsRequest(
    projectBase(target),
    `${pullRequestPath(target.repositoryId, target.pullRequestId)}/threads/${segment(threadId)}`,
    { method: 'PATCH', body: { status }, timeoutMs: 15_000 }
  )
}

export type RawReviewItem = {
  content?: string | null
  contentMetadata?: { isBinary?: boolean | null } | null
}

/** File content at a commit; null when the path does not exist there. */
export async function getAzureDevOpsReviewItemAtCommit(
  target: AzureDevOpsReviewTarget & { repositoryId: string },
  path: string,
  commit: string
): Promise<RawReviewItem | null> {
  try {
    return await sendAzureDevOpsRequest<RawReviewItem>(
      projectBase(target),
      `/_apis/git/repositories/${segment(target.repositoryId)}/items`,
      {
        searchParams: {
          path,
          'versionDescriptor.version': commit,
          'versionDescriptor.versionType': 'commit',
          includeContent: 'true',
          // Why: without it `isBinary` is absent and binary files arrive as mangled text.
          includeContentMetadata: 'true',
          $format: 'json'
        },
        timeoutMs: 20_000
      }
    )
  } catch (error) {
    if (error instanceof AzureDevOpsRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export type RawReviewItemBytes =
  | { kind: 'bytes'; bytes: Buffer }
  | { kind: 'missing' }
  | { kind: 'too-large' }

/** A file's raw bytes at a commit, for content the JSON API cannot carry (images). */
export async function getAzureDevOpsReviewItemBytesAtCommit(
  target: AzureDevOpsReviewTarget & { repositoryId: string },
  path: string,
  commit: string,
  maxBytes: number
): Promise<RawReviewItemBytes> {
  try {
    const bytes = await sendAzureDevOpsBinaryRequest(
      projectBase(target),
      `/_apis/git/repositories/${segment(target.repositoryId)}/items`,
      {
        searchParams: {
          path,
          'versionDescriptor.version': commit,
          'versionDescriptor.versionType': 'commit',
          $format: 'octetStream'
        },
        timeoutMs: 20_000,
        maxBytes
      }
    )
    return bytes ? { kind: 'bytes', bytes } : { kind: 'too-large' }
  } catch (error) {
    if (error instanceof AzureDevOpsRequestError && error.status === 404) {
      return { kind: 'missing' }
    }
    throw error
  }
}
