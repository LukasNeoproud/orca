// Why: tokens stay encrypted via the secret store while connection metadata is
// plaintext, so status rendering never triggers an OS keychain prompt.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CredentialDecryptionError,
  credentialFileHasContent,
  readStoredCredentialToken,
  writeEncryptedCredential
} from '../integration-credential-file'
import type { AzureDevOpsConnection } from '../../shared/azure-devops-review-types'

type ConnectionFile = { version: 1; connections: AzureDevOpsConnection[] }

let cachedFile: ConnectionFile | null = null
const cachedTokens = new Map<string, string>()
const credentialErrors = new Map<string, string>()

function orcaDir(): string {
  return join(homedir(), '.orca')
}

function connectionFilePath(): string {
  return join(orcaDir(), 'azure-devops-connections.json')
}

function tokenDir(): string {
  return join(orcaDir(), 'azure-devops-tokens')
}

function tokenPath(connectionId: string): string {
  return join(tokenDir(), `${Buffer.from(connectionId).toString('base64url')}.enc`)
}

function normalizeConnection(input: unknown): AzureDevOpsConnection | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.organizationKey !== 'string' ||
    typeof record.organizationUrl !== 'string' ||
    typeof record.label !== 'string'
  ) {
    return null
  }
  return {
    id: record.id,
    organizationKey: record.organizationKey,
    organizationUrl: record.organizationUrl,
    label: record.label,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0
  }
}

function readFile(): ConnectionFile {
  if (cachedFile) {
    return cachedFile
  }
  const path = connectionFilePath()
  let connections: AzureDevOpsConnection[] = []
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ConnectionFile>
      connections = Array.isArray(parsed.connections)
        ? parsed.connections
            .map(normalizeConnection)
            .filter((connection): connection is AzureDevOpsConnection => connection !== null)
        : []
    } catch {
      connections = []
    }
  }
  cachedFile = { version: 1, connections }
  return cachedFile
}

function writeFile(file: ConnectionFile): void {
  mkdirSync(orcaDir(), { recursive: true })
  cachedFile = file
  writeFileSync(connectionFilePath(), JSON.stringify(file, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

export function listAzureDevOpsConnections(): AzureDevOpsConnection[] {
  return readFile().connections
}

export function findAzureDevOpsConnection(organizationKey: string): AzureDevOpsConnection | null {
  return readFile().connections.find((c) => c.organizationKey === organizationKey) ?? null
}

/** Replaces any connection for the same organization: one credential per org. */
export function saveAzureDevOpsConnection(
  connection: AzureDevOpsConnection,
  token: string | null
): void {
  if (token !== null) {
    mkdirSync(tokenDir(), { recursive: true })
    writeEncryptedCredential('Azure DevOps', tokenPath(connection.id), token)
    cachedTokens.set(connection.id, token)
    credentialErrors.delete(connection.id)
  }
  const replaced = readFile().connections.filter(
    (existing) => existing.organizationKey === connection.organizationKey
  )
  for (const existing of replaced) {
    if (existing.id !== connection.id) {
      deleteToken(existing.id)
    }
  }
  writeFile({
    version: 1,
    connections: [
      ...readFile().connections.filter((c) => c.organizationKey !== connection.organizationKey),
      connection
    ]
  })
}

function deleteToken(connectionId: string): void {
  cachedTokens.delete(connectionId)
  credentialErrors.delete(connectionId)
  try {
    unlinkSync(tokenPath(connectionId))
  } catch {
    // Already gone.
  }
}

export function removeAzureDevOpsConnection(connectionId: string): void {
  deleteToken(connectionId)
  writeFile({
    version: 1,
    connections: readFile().connections.filter((c) => c.id !== connectionId)
  })
}

export function hasAzureDevOpsConnectionToken(connectionId: string): boolean {
  return cachedTokens.has(connectionId) || credentialFileHasContent(tokenPath(connectionId))
}

export function readAzureDevOpsConnectionToken(connectionId: string): string | null {
  const cached = cachedTokens.get(connectionId)
  if (cached !== undefined) {
    return cached
  }
  const path = tokenPath(connectionId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const token = readStoredCredentialToken('Azure DevOps', readFileSync(path))
    if (token) {
      cachedTokens.set(connectionId, token)
    }
    credentialErrors.delete(connectionId)
    return token
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      credentialErrors.set(connectionId, error.message)
    }
    return null
  }
}

export function getAzureDevOpsConnectionCredentialError(connectionId: string): string | null {
  return credentialErrors.get(connectionId) ?? null
}
