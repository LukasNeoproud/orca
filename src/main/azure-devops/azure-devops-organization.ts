import type { AzureDevOpsRepoRef } from './repository-ref'

export type AzureDevOpsOrganizationRef = {
  /** Lowercased URL without protocol: credentials and PR keys are scoped by it. */
  organizationKey: string
  organizationUrl: string
  label: string
}

function trimPath(pathname: string): string {
  return pathname
    .replace(/\/+$/, '')
    .replace(/\/_apis$/i, '')
    .replace(/\/+$/, '')
}

function organizationRef(url: string, label: string): AzureDevOpsOrganizationRef {
  return {
    organizationKey: url.replace(/^https?:\/\//i, '').toLowerCase(),
    organizationUrl: url,
    label
  }
}

function cloudOrganization(organization: string): AzureDevOpsOrganizationRef {
  return organizationRef(`https://dev.azure.com/${encodeURIComponent(organization)}`, organization)
}

/** Accepts `https://dev.azure.com/org`, `org.visualstudio.com` or a Server collection URL. */
export function parseAzureDevOpsOrganizationUrl(input: string): AzureDevOpsOrganizationRef | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }
  const host = url.hostname.toLowerCase()
  const segments = trimPath(url.pathname).split('/').filter(Boolean)
  if (host === 'dev.azure.com') {
    const organization = segments[0] ? decodeURIComponent(segments[0]) : ''
    return organization ? cloudOrganization(organization) : null
  }
  if (host.endsWith('.visualstudio.com')) {
    const organization = host.slice(0, -'.visualstudio.com'.length)
    return organization ? cloudOrganization(organization) : null
  }
  // Why: Server collections live under an arbitrary path; the collection URL is the org scope.
  const path = trimPath(url.pathname)
  const label = segments.length > 0 ? decodeURIComponent(segments.at(-1) ?? '') : host
  return organizationRef(`${url.origin}${path}`, label || host)
}

export function azureDevOpsOrganizationForRepo(
  ref: AzureDevOpsRepoRef
): AzureDevOpsOrganizationRef | null {
  if (ref.organization) {
    return cloudOrganization(ref.organization)
  }
  // Server refs carry `<collection>/<project>` as the API base.
  const projectSuffix = `/${encodeURIComponent(ref.project)}`
  if (!ref.apiBaseUrl.endsWith(projectSuffix)) {
    return null
  }
  return parseAzureDevOpsOrganizationUrl(ref.apiBaseUrl.slice(0, -projectSuffix.length))
}

/** Org key for any API URL under an organization, used to pick credentials per request. */
export function azureDevOpsOrganizationKeyMatches(organizationKey: string, url: URL): boolean {
  const candidate = `${url.host}${url.pathname}`.toLowerCase()
  if (url.hostname.toLowerCase().endsWith('.visualstudio.com')) {
    const organization = url.hostname.toLowerCase().slice(0, -'.visualstudio.com'.length)
    return organizationKey === `dev.azure.com/${organization}`
  }
  return candidate === organizationKey || candidate.startsWith(`${organizationKey}/`)
}
