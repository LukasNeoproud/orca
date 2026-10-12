import type { AzureDevOpsRepoRef } from './repository-ref'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { resolveAzureDevOpsConnectionAuthHeaders } from './azure-devops-credentials'
import {
  authHeaders,
  getAzureDevOpsAuthConfig,
  normalizeAzureDevOpsApiBaseUrl
} from './azure-devops-auth-config'

const REQUEST_TIMEOUT_MS = 5000
const DEFAULT_API_VERSION = '7.1'

// Why (STA-3494): on-prem Azure DevOps Server rejects versioned requests without
// the -preview suffix; remember which origins need it after the first rejection.
const previewApiVersionOrigins = new Set<string>()

/** @internal - exposed for tests only */
export function _resetAzureDevOpsPreviewApiVersionCache(): void {
  previewApiVersionOrigins.clear()
}

export function markAzureDevOpsPreviewApiVersionOrigin(origin: string): void {
  previewApiVersionOrigins.add(origin)
}

export function azureDevOpsApiVersionForOrigin(
  origin: string,
  requested?: string | number
): string {
  const version = String(requested ?? DEFAULT_API_VERSION)
  return previewApiVersionOrigins.has(origin) && !version.endsWith('-preview')
    ? `${version}-preview`
    : version
}

export function isAzureDevOpsPreviewVersionRejection(status: number | null, body: string): boolean {
  if (status !== 400) {
    return false
  }
  try {
    const parsed = JSON.parse(body) as { typeKey?: unknown } | null
    return parsed?.typeKey === 'VssInvalidPreviewVersionException'
  } catch {
    return false
  }
}

export type AzureDevOpsRequestOptions = {
  searchParams?: Record<string, string | number>
  timeoutMs?: number
}

function isUrlPathAncestor(ancestor: string, descendant: string): boolean {
  try {
    const ancestorUrl = new URL(ancestor)
    const descendantUrl = new URL(descendant)
    const ancestorPath = ancestorUrl.pathname.replace(/\/+$/, '')
    const descendantPath = descendantUrl.pathname.replace(/\/+$/, '')
    return (
      ancestorUrl.origin === descendantUrl.origin &&
      (ancestorPath === descendantPath || descendantPath.startsWith(`${ancestorPath}/`))
    )
  } catch {
    return false
  }
}

export function resolveAzureDevOpsGitApiBaseUrl(repo: AzureDevOpsRepoRef): string {
  const configured = getAzureDevOpsAuthConfig().apiBaseUrl
  if (!configured) {
    return repo.apiBaseUrl
  }
  const normalized = normalizeAzureDevOpsApiBaseUrl(configured)
  // Why (STA-3494): a configured collection ancestor is the auth-probe URL;
  // Git endpoints need the project-level base derived from the remote.
  return isUrlPathAncestor(normalized, repo.apiBaseUrl) ? repo.apiBaseUrl : normalized
}

function apiUrl(
  baseUrl: string,
  path: string,
  searchParams?: AzureDevOpsRequestOptions['searchParams']
): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  const params = {
    ...searchParams,
    'api-version': azureDevOpsApiVersionForOrigin(url.origin, searchParams?.['api-version'])
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url
}

// Reads the body only for a 400 on a non-preview request; consumed either way.
async function shouldRetryWithPreviewApiVersion(url: URL, response: Response): Promise<boolean> {
  if (response.ok || response.status !== 400) {
    return false
  }
  if (url.searchParams.get('api-version')?.endsWith('-preview')) {
    return false
  }
  try {
    const body = (await response.json()) as { typeKey?: string | null } | null
    return body?.typeKey === 'VssInvalidPreviewVersionException'
  } catch {
    return false
  }
}

// Why: a saved per-organization connection outranks the single env credential.
async function requestAuthHeaders(url: URL): Promise<Record<string, string>> {
  return (
    (await resolveAzureDevOpsConnectionAuthHeaders(url)) ?? authHeaders(getAzureDevOpsAuthConfig())
  )
}

type AzureDevOpsFetchInit = {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  searchParams?: AzureDevOpsRequestOptions['searchParams']
  timeoutMs?: number
}

async function fetchAzureDevOps(
  baseUrl: string,
  path: string,
  init: AzureDevOpsFetchInit
): Promise<Response> {
  const doFetch = async (url: URL): Promise<Response> =>
    fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await requestAuthHeaders(url))
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS)
    })
  const url = apiUrl(baseUrl, path, init.searchParams)
  const response = await doFetch(url)
  if (await shouldRetryWithPreviewApiVersion(url, response)) {
    markAzureDevOpsPreviewApiVersionOrigin(url.origin)
    return doFetch(apiUrl(baseUrl, path, init.searchParams))
  }
  return response
}

export async function requestAzureDevOpsJsonAtBase<T>(
  baseUrl: string,
  path: string,
  options: AzureDevOpsRequestOptions = {},
  // Why: the existing-review lookup behind Create must distinguish a real
  // transport/auth failure from an accepted "no PR". When true, a failed request
  // throws instead of collapsing to null so callers never report false not_found.
  throwOnFailure = false
): Promise<T | null> {
  try {
    const response = await fetchAzureDevOps(baseUrl, path, options)
    if (!response.ok) {
      await cancelUnreadResponseBody(response)
      if (throwOnFailure) {
        throw new Error(`Azure DevOps request failed: HTTP ${response.status}`)
      }
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    if (throwOnFailure) {
      throw error
    }
    return null
  }
}

export class AzureDevOpsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message)
    this.name = 'AzureDevOpsRequestError'
  }
}

function describeHttpFailure(status: number, serverMessage: string | null): string {
  if (status === 401) {
    return 'Azure DevOps rejected the credentials. Reconnect the organization in Settings.'
  }
  if (status === 403) {
    return serverMessage ?? 'The Azure DevOps token lacks permission for this request.'
  }
  if (status === 404) {
    return serverMessage ?? 'Azure DevOps could not find the requested resource.'
  }
  if (status === 429) {
    return 'Azure DevOps is throttling requests. Try again in a moment.'
  }
  return serverMessage ?? `Azure DevOps request failed: HTTP ${status}`
}

/** Strict request for the review surfaces: failures throw a user-readable error. */
export async function sendAzureDevOpsRequest<T>(
  baseUrl: string,
  path: string,
  init: AzureDevOpsFetchInit = {}
): Promise<T> {
  let response: Response
  try {
    response = await fetchAzureDevOps(baseUrl, path, init)
  } catch (error) {
    throw new AzureDevOpsRequestError(error instanceof Error ? error.message : String(error), null)
  }
  // Why: unauthenticated requests get a 203 sign-in HTML page instead of a 401.
  if (response.status === 203) {
    await cancelUnreadResponseBody(response)
    throw new AzureDevOpsRequestError(describeHttpFailure(401, null), 401)
  }
  if (!response.ok) {
    let serverMessage: string | null = null
    try {
      const body = (await response.json()) as { message?: unknown } | null
      serverMessage = typeof body?.message === 'string' ? body.message : null
    } catch {
      await cancelUnreadResponseBody(response)
    }
    throw new AzureDevOpsRequestError(
      describeHttpFailure(response.status, serverMessage),
      response.status
    )
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new AzureDevOpsRequestError(
      'Azure DevOps returned an unreadable response.',
      response.status
    )
  }
}

export function requestAzureDevOpsJson<T>(
  repo: AzureDevOpsRepoRef,
  path: string,
  options: AzureDevOpsRequestOptions = {},
  throwOnFailure = false
): Promise<T | null> {
  return requestAzureDevOpsJsonAtBase(
    resolveAzureDevOpsGitApiBaseUrl(repo),
    path,
    options,
    throwOnFailure
  )
}

export {
  azureDevOpsTokenConfigured,
  getAzureDevOpsAuthConfig,
  normalizeAzureDevOpsApiBaseUrl
} from './azure-devops-auth-config'
