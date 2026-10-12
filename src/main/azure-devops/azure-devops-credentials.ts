import { azureDevOpsOrganizationKeyMatches } from './azure-devops-organization'
import {
  listAzureDevOpsConnections,
  readAzureDevOpsConnectionToken
} from './azure-devops-connection-store'
import type { AzureDevOpsConnection } from '../../shared/azure-devops-review-types'
import {
  azureDevOpsTokenConfigured,
  getAzureDevOpsAuthConfig,
  normalizeAzureDevOpsApiBaseUrl
} from './azure-devops-auth-config'

export async function azureDevOpsConnectionAuthHeaders(
  connection: AzureDevOpsConnection,
  token?: string | null
): Promise<Record<string, string> | null> {
  const pat = token ?? readAzureDevOpsConnectionToken(connection.id)
  return pat ? { Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` } : null
}

export function findAzureDevOpsConnectionForUrl(url: URL): AzureDevOpsConnection | null {
  return (
    listAzureDevOpsConnections().find((connection) =>
      azureDevOpsOrganizationKeyMatches(connection.organizationKey, url)
    ) ?? null
  )
}

/** Connection credentials for a request URL; null falls back to the ORCA_AZURE_DEVOPS_* env. */
export async function resolveAzureDevOpsConnectionAuthHeaders(
  url: URL
): Promise<Record<string, string> | null> {
  const connection = findAzureDevOpsConnectionForUrl(url)
  return connection ? azureDevOpsConnectionAuthHeaders(connection) : null
}

/** Where requests for an organization get credentials from; null means none are configured. */
export function azureDevOpsOrganizationCredentialSource(
  organizationKey: string
): 'connection' | 'environment' | null {
  if (listAzureDevOpsConnections().some((c) => c.organizationKey === organizationKey)) {
    return 'connection'
  }
  const env = getAzureDevOpsAuthConfig()
  if (!azureDevOpsTokenConfigured(env)) {
    return null
  }
  if (!env.apiBaseUrl) {
    return 'environment'
  }
  try {
    // Why: the env credential belongs to whichever org its base URL names.
    const envUrl = new URL(normalizeAzureDevOpsApiBaseUrl(env.apiBaseUrl))
    return azureDevOpsOrganizationKeyMatches(organizationKey, envUrl) ? 'environment' : null
  } catch {
    return null
  }
}
