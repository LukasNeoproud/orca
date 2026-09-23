import { sign } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  ANDROID_VERSION_CODE_MAX,
  KEYCHAIN_ACCOUNTS,
  PRIVATE_FIREBASE_APP_ID,
  PRIVATE_FIREBASE_PROJECT_NUMBER,
  TOUCHID_KEYCHAIN_PATH,
  privateDistributionKeychainPairs
} from './private-android-local-publish-contract.mjs'

export function readPrivateDistributionSecrets(spawn = spawnSync) {
  const pairs = privateDistributionKeychainPairs()
  const result = spawn(
    TOUCHID_KEYCHAIN_PATH,
    ['get', '--json', ...pairs.flatMap(({ service, account }) => [service, account])],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  )
  if (result.error || result.status !== 0) {
    throw new Error('Touch ID Keychain batch read failed')
  }
  return parsePrivateDistributionSecretBatch(String(result.stdout || ''))
}

export function parsePrivateDistributionSecretBatch(raw) {
  let rows
  try {
    rows = JSON.parse(raw)
  } catch {
    throw new Error('Touch ID Keychain returned an invalid secret batch')
  }
  const pairs = privateDistributionKeychainPairs()
  if (!Array.isArray(rows) || rows.length !== pairs.length) {
    throw new Error('Touch ID Keychain returned an incomplete secret batch')
  }
  const values = new Map()
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.service !== 'string' ||
      typeof row.account !== 'string' ||
      typeof row.value !== 'string' ||
      !row.value
    ) {
      throw new Error('Touch ID Keychain returned an invalid secret batch')
    }
    const pair = pairs.find(
      ({ service, account }) => service === row.service && account === row.account
    )
    if (!pair || values.has(pair.account)) {
      throw new Error('Touch ID Keychain returned an unexpected secret batch')
    }
    values.set(pair.account, row.value)
  }
  if (pairs.some(({ account }) => !values.has(account))) {
    throw new Error('Touch ID Keychain returned an incomplete secret batch')
  }
  return {
    keystoreBase64: values.get(KEYCHAIN_ACCOUNTS.keystoreBase64),
    keystorePassword: values.get(KEYCHAIN_ACCOUNTS.keystorePassword),
    keyAlias: values.get(KEYCHAIN_ACCOUNTS.keyAlias),
    keyPassword: values.get(KEYCHAIN_ACCOUNTS.keyPassword),
    firebaseJson: values.get(KEYCHAIN_ACCOUNTS.firebaseJson)
  }
}

export function createPrivateTempDirectory() {
  const directory = path.join(
    os.tmpdir(),
    `orca-private-android-${process.pid}-${Date.now().toString(36)}`
  )
  mkdirSync(directory, { mode: 0o700 })
  chmodSync(directory, 0o700)
  return directory
}

export function writePrivateFile(filePath, contents) {
  writeFileSync(filePath, contents, { mode: 0o600, flag: 'wx' })
  chmodSync(filePath, 0o600)
}

export function cleanupPrivateTempDirectory(directory) {
  if (directory) {
    rmSync(directory, { force: true, recursive: true })
  }
}

export async function createFirebaseAccessToken(credentials, fetchImpl = fetch) {
  const now = Math.floor(Date.now() / 1000)
  const assertion = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
    iat: now - 30,
    exp: now + 3_600
  })}`
  const signature = sign('RSA-SHA256', Buffer.from(assertion), credentials.private_key).toString(
    'base64url'
  )
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${assertion}.${signature}`
  })
  const response = await fetchImpl(credentials.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    throw new Error(`Firebase authentication failed with HTTP ${response.status}`)
  }
  const payload = await response.json()
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Firebase authentication returned no access token')
  }
  return payload.access_token
}

export async function readMaxFirebaseVersionCode(accessToken, fetchImpl = fetch) {
  const parent = `projects/${PRIVATE_FIREBASE_PROJECT_NUMBER}/apps/${PRIVATE_FIREBASE_APP_ID}`
  let pageToken = null
  let maximum = 0
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(
      `https://firebaseappdistribution.googleapis.com/v1/${parent.replaceAll(':', '%3A')}/releases`
    )
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('orderBy', 'createTime desc')
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` }
    })
    if (!response.ok) {
      throw new Error(`Unable to read Firebase releases (HTTP ${response.status})`)
    }
    const payload = await response.json()
    const releases = Array.isArray(payload.releases) ? payload.releases : []
    for (const release of releases) {
      const versionCode = Number(release?.buildVersion)
      if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
        throw new Error('Firebase returned an invalid Android build version')
      }
      maximum = Math.max(maximum, versionCode)
    }
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null
    if (!pageToken) {
      return maximum
    }
  }
  throw new Error('Firebase release history exceeded the bounded pagination limit')
}

export function readLocalPublishedVersionCode(statePath) {
  if (!existsSync(statePath)) {
    return 0
  }
  const value = Number(readFileSync(statePath, 'utf8').trim())
  if (!Number.isSafeInteger(value) || value <= 0 || value > ANDROID_VERSION_CODE_MAX) {
    throw new Error(`Invalid local version state at ${statePath}`)
  }
  return value
}

export function writeLocalPublishedVersionCode(statePath, versionCode) {
  const stateDirectory = path.dirname(statePath)
  mkdirSync(stateDirectory, { mode: 0o700, recursive: true })
  chmodSync(stateDirectory, 0o700)
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${versionCode}\n`, { mode: 0o600, flag: 'wx' })
  chmodSync(temporaryPath, 0o600)
  try {
    renameSync(temporaryPath, statePath)
    chmodSync(statePath, 0o600)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
