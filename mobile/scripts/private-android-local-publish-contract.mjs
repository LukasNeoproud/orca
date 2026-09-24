import { homedir } from 'node:os'
import { join } from 'node:path'

export const PRIVATE_ANDROID_PACKAGE = 'cz.neoproud.orca.dev'
export const PRIVATE_FIREBASE_APP_ID = '1:100414786379:android:410ca57940be633c0676ce'
export const PRIVATE_FIREBASE_PROJECT_NUMBER = '100414786379'
export const PRIVATE_FIREBASE_SERVICE_ACCOUNT =
  'orca-mobile-distribution@orca-dev-447f3.iam.gserviceaccount.com'
export const FIREBASE_TOOLS_VERSION = '15.30.2'
export const TOUCHID_KEYCHAIN_PATH = join(homedir(), '.local', 'bin', 'touchid-keychain')
export const KEYCHAIN_SERVICE = 'cz.neoproud.orca.dev.private-distribution'
export const KEYCHAIN_ACCOUNTS = Object.freeze({
  keystoreBase64: 'android-keystore-base64',
  keystorePassword: 'android-keystore-password',
  keyAlias: 'android-key-alias',
  keyPassword: 'android-key-password',
  firebaseJson: 'firebase-service-account-json'
})

export const PRIVATE_VERSION_CODE_FLOOR = 1_000_000
export const ANDROID_VERSION_CODE_MAX = 2_100_000_000

export function privateDistributionKeychainPairs() {
  return Object.values(KEYCHAIN_ACCOUNTS).map((account) => ({
    service: KEYCHAIN_SERVICE,
    account
  }))
}

export function parseLocalPublishArgs(argv) {
  const options = {
    approval: 'touch-id',
    publish: false,
    existingApk: false,
    groups: null,
    releaseNotes: null,
    versionCode: null,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--publish') {
      options.publish = true
    } else if (arg === '--approval') {
      options.approval = requiredArgument(argv, ++index, '--approval')
    } else if (arg === '--existing-apk') {
      options.existingApk = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--groups') {
      options.groups = requiredArgument(argv, ++index, '--groups')
    } else if (arg === '--release-notes') {
      options.releaseNotes = requiredArgument(argv, ++index, '--release-notes')
    } else if (arg === '--version-code') {
      options.versionCode = parseVersionCode(requiredArgument(argv, ++index, '--version-code'))
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (options.groups) {
    options.groups = normalizeGroups(options.groups)
  }
  if (options.publish && !options.groups) {
    throw new Error('--groups is required with --publish')
  }
  if (options.existingApk && !options.publish) {
    throw new Error('--existing-apk requires --publish')
  }
  if (!['touch-id', 'mobile'].includes(options.approval)) {
    throw new Error('--approval must be touch-id or mobile')
  }
  if (options.approval === 'mobile' && options.publish && !options.releaseNotes) {
    throw new Error('--release-notes is required with mobile approval and --publish')
  }
  if (options.approval === 'mobile' && options.existingApk) {
    throw new Error('--existing-apk is not yet supported with mobile approval')
  }
  if (!options.publish && (options.groups || options.releaseNotes)) {
    throw new Error('--groups and --release-notes are only valid with --publish')
  }
  return options
}

export function nextPrivateVersionCode({
  remoteVersionCode,
  localVersionCode,
  explicitVersionCode
}) {
  const current = Math.max(
    PRIVATE_VERSION_CODE_FLOOR - 1,
    normalizePriorVersionCode(remoteVersionCode),
    normalizePriorVersionCode(localVersionCode)
  )
  const next = explicitVersionCode ?? current + 1
  if (!Number.isSafeInteger(next) || next <= current || next > ANDROID_VERSION_CODE_MAX) {
    throw new Error(
      `Private Android versionCode must be above ${current} and at most ${ANDROID_VERSION_CODE_MAX}`
    )
  }
  return next
}

export function classifyExistingPrivateApkVersion({
  apkVersionCode,
  remoteVersionCode,
  localVersionCode,
  explicitVersionCode
}) {
  if (
    !Number.isSafeInteger(apkVersionCode) ||
    apkVersionCode < PRIVATE_VERSION_CODE_FLOOR ||
    apkVersionCode > ANDROID_VERSION_CODE_MAX ||
    (explicitVersionCode !== null && explicitVersionCode !== apkVersionCode)
  ) {
    throw new Error('Existing APK versionCode does not match the requested private release')
  }
  if (apkVersionCode < localVersionCode || apkVersionCode < remoteVersionCode) {
    throw new Error('Existing APK versionCode is older than published release history')
  }
  if (remoteVersionCode === apkVersionCode) {
    return 'already-published'
  }
  if (apkVersionCode === localVersionCode) {
    throw new Error('Existing APK versionCode is older than published release history')
  }
  return 'upload'
}

export function parseFirebaseServiceAccount(raw) {
  let credentials
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error('Firebase Keychain item is not valid JSON')
  }
  if (
    credentials?.type !== 'service_account' ||
    credentials.client_email !== PRIVATE_FIREBASE_SERVICE_ACCOUNT ||
    typeof credentials.private_key !== 'string' ||
    !credentials.private_key.includes('BEGIN PRIVATE KEY') ||
    typeof credentials.token_uri !== 'string' ||
    !credentials.token_uri.startsWith('https://oauth2.googleapis.com/')
  ) {
    throw new Error('Firebase Keychain item is not the expected service-account key')
  }
  return credentials
}

export function decodeKeystoreBase64(raw) {
  const encoded = raw.trim()
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Android keystore Keychain item is not valid single-line base64')
  }
  const decoded = Buffer.from(encoded, 'base64')
  if (!decoded.length) {
    throw new Error('Android keystore Keychain item is empty')
  }
  return decoded
}

export function extractTestingUri(output) {
  const matches = [...output.matchAll(/testing_uri:\s*(https:\/\/[^\s]+)/g)]
  return matches.at(-1)?.[1] ?? null
}

export function parseApkSignerDigests(output) {
  return [...output.matchAll(/certificate SHA-256 digest:\s*([0-9a-f:]+)/gi)].map((match) =>
    match[1].replaceAll(':', '').toLowerCase()
  )
}

function requiredArgument(argv, index, name) {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function normalizeGroups(value) {
  const groups = value
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean)
  if (!groups.length || groups.some((group) => !/^[A-Za-z0-9_-]+$/.test(group))) {
    throw new Error('--groups must contain comma-separated Firebase group aliases')
  }
  return [...new Set(groups)].join(',')
}

function parseVersionCode(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > ANDROID_VERSION_CODE_MAX) {
    throw new Error(`--version-code must be between 1 and ${ANDROID_VERSION_CODE_MAX}`)
  }
  return parsed
}

function normalizePriorVersionCode(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}
