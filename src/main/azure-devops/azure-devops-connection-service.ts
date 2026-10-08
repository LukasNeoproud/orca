import { randomUUID } from 'node:crypto'
import type { Repo } from '../../shared/repo-types'
import type {
  AzureDevOpsConnectInput,
  AzureDevOpsConnectResult,
  AzureDevOpsConnection,
  AzureDevOpsConnectionView,
  AzureDevOpsConnectionsStatus,
  AzureDevOpsDetectedOrganization
} from '../../shared/azure-devops-review-types'
import { parseAzureDevOpsOrganizationUrl } from './azure-devops-organization'
import {
  findAzureDevOpsConnection,
  getAzureDevOpsConnectionCredentialError,
  listAzureDevOpsConnections,
  removeAzureDevOpsConnection,
  saveAzureDevOpsConnection
} from './azure-devops-connection-store'
import {
  azureDevOpsConnectionAuthHeaders,
  azureDevOpsOrganizationCredentialSource
} from './azure-devops-credentials'
import { azureDevOpsTokenConfigured, getAzureDevOpsAuthConfig } from './azure-devops-api-request'
import { collectAzureDevOpsReviewRepos } from './review/azure-devops-review-repos'
import { forgetAzureDevOpsReviewOrganization } from './review/azure-devops-review-client'

const PROBE_TIMEOUT_MS = 10_000

function toView(connection: AzureDevOpsConnection): AzureDevOpsConnectionView {
  return { ...connection, credentialError: getAzureDevOpsConnectionCredentialError(connection.id) }
}

export async function getAzureDevOpsConnectionsStatus(
  repos: readonly Repo[]
): Promise<AzureDevOpsConnectionsStatus> {
  const sources = await collectAzureDevOpsReviewRepos(repos)
  const detected = new Map<string, AzureDevOpsDetectedOrganization>()
  for (const source of sources) {
    const existing = detected.get(source.organizationKey)
    if (existing) {
      existing.repoCount += 1
      continue
    }
    detected.set(source.organizationKey, {
      organizationKey: source.organizationKey,
      organizationUrl: source.organizationUrl,
      label: source.organizationLabel,
      repoCount: 1,
      credentialSource: azureDevOpsOrganizationCredentialSource(source.organizationKey)
    })
  }
  return {
    connections: listAzureDevOpsConnections().map(toView),
    detected: [...detected.values()].sort((a, b) => a.label.localeCompare(b.label)),
    environmentConfigured: azureDevOpsTokenConfigured(getAzureDevOpsAuthConfig())
  }
}

async function probeConnection(
  organizationUrl: string,
  headers: Record<string, string>
): Promise<string | null> {
  const response = await fetch(`${organizationUrl.replace(/\/+$/, '')}/_apis/connectionData`, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
  })
  // Why: unauthenticated requests get a 203 sign-in page rather than a 401.
  if (!response.ok || response.status === 203) {
    throw new Error(
      response.status === 401 || response.status === 203
        ? 'Azure DevOps rejected the credentials.'
        : `Azure DevOps answered HTTP ${response.status}.`
    )
  }
  const body = (await response.json()) as {
    authenticatedUser?: {
      id?: string | null
      providerDisplayName?: string | null
      customDisplayName?: string | null
    } | null
  }
  const user = body.authenticatedUser
  if (!user?.id || user.id === 'aa442ccd-ffc1-4ab8-b30c-b5a4c0e3e5b5') {
    throw new Error('Azure DevOps did not accept the credentials for this organization.')
  }
  return user.customDisplayName ?? user.providerDisplayName ?? null
}

export async function connectAzureDevOps(
  input: AzureDevOpsConnectInput
): Promise<AzureDevOpsConnectResult> {
  const organization = parseAzureDevOpsOrganizationUrl(input.organizationUrl)
  if (!organization) {
    return { ok: false, error: 'Enter an organization URL such as https://dev.azure.com/contoso.' }
  }
  const token = input.token?.trim() ?? ''
  if (!token) {
    return { ok: false, error: 'Enter a personal access token.' }
  }
  const connection: AzureDevOpsConnection = {
    id: findAzureDevOpsConnection(organization.organizationKey)?.id ?? randomUUID(),
    organizationKey: organization.organizationKey,
    organizationUrl: organization.organizationUrl,
    label: input.label?.trim() || organization.label,
    createdAt: Date.now()
  }
  try {
    const headers = await azureDevOpsConnectionAuthHeaders(connection, token)
    if (!headers) {
      return { ok: false, error: 'No credentials to test.' }
    }
    const account = await probeConnection(connection.organizationUrl, headers)
    saveAzureDevOpsConnection(connection, token)
    forgetAzureDevOpsReviewOrganization(connection.organizationKey)
    return { ok: true, connection: toView(connection), account }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function disconnectAzureDevOps(connectionId: string): void {
  const connection = listAzureDevOpsConnections().find((c) => c.id === connectionId)
  removeAzureDevOpsConnection(connectionId)
  if (connection) {
    forgetAzureDevOpsReviewOrganization(connection.organizationKey)
  }
}
