import { existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANDROID_VERSION_CODE_MAX,
  KEYCHAIN_ACCOUNTS,
  KEYCHAIN_SERVICE,
  PRIVATE_ANDROID_PACKAGE,
  PRIVATE_FIREBASE_APP_ID,
  TOUCHID_KEYCHAIN_PATH,
  decodeKeystoreBase64,
  extractTestingUri,
  nextPrivateVersionCode,
  parseFirebaseServiceAccount,
  parseApkSignerDigests,
  parseLocalPublishArgs
} from '../../scripts/private-android-local-publish-contract.mjs'
import {
  cleanupPrivateTempDirectory,
  createPrivateTempDirectory,
  parsePrivateDistributionSecretBatch,
  readLocalPublishedVersionCode,
  readFirebaseTestingUri,
  readMaxFirebaseVersionCode,
  readPrivateDistributionSecrets,
  writeLocalPublishedVersionCode,
  writePrivateFile
} from '../../scripts/private-android-local-publish-runtime.mjs'

let tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories) {
    cleanupPrivateTempDirectory(directory)
  }
  tempDirectories = []
})

describe('local private Android publishing contract', () => {
  it('keeps the requested private app and Keychain identities fixed', () => {
    expect(PRIVATE_ANDROID_PACKAGE).toBe('cz.neoproud.orca.dev')
    expect(PRIVATE_FIREBASE_APP_ID).toBe('1:100414786379:android:410ca57940be633c0676ce')
    expect(KEYCHAIN_SERVICE).toBe('cz.neoproud.orca.dev.private-distribution')
    expect(TOUCHID_KEYCHAIN_PATH).toBe(join(homedir(), '.local', 'bin', 'touchid-keychain'))
    expect(Object.values(KEYCHAIN_ACCOUNTS)).toEqual([
      'android-keystore-base64',
      'android-keystore-password',
      'android-key-alias',
      'android-key-password',
      'firebase-service-account-json'
    ])
  })

  it('retrieves all five secrets with exactly one Touch ID batch invocation', () => {
    const rows = Object.values(KEYCHAIN_ACCOUNTS).map((account) => ({
      service: KEYCHAIN_SERVICE,
      account,
      value: `value:${account}`
    }))
    const spawn = vi.fn(() => ({ status: 0, stdout: JSON.stringify(rows.toReversed()) }))

    expect(readPrivateDistributionSecrets(spawn as never)).toEqual({
      keystoreBase64: 'value:android-keystore-base64',
      keystorePassword: 'value:android-keystore-password',
      keyAlias: 'value:android-key-alias',
      keyPassword: 'value:android-key-password',
      firebaseJson: 'value:firebase-service-account-json'
    })
    expect(spawn).toHaveBeenCalledOnce()
    expect(spawn).toHaveBeenCalledWith(
      TOUCHID_KEYCHAIN_PATH,
      [
        'get',
        '--json',
        KEYCHAIN_SERVICE,
        'android-keystore-base64',
        KEYCHAIN_SERVICE,
        'android-keystore-password',
        KEYCHAIN_SERVICE,
        'android-key-alias',
        KEYCHAIN_SERVICE,
        'android-key-password',
        KEYCHAIN_SERVICE,
        'firebase-service-account-json'
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    )
  })

  it('rejects missing, duplicate, and extra batch records without leaking values', () => {
    const secret = 'must-not-appear-in-errors'
    const rows = Object.values(KEYCHAIN_ACCOUNTS).map((account) => ({
      service: KEYCHAIN_SERVICE,
      account,
      value: secret
    }))
    const invalidBatches = [
      rows.slice(1),
      [rows[0], rows[0], ...rows.slice(2)],
      [...rows.slice(1), { service: KEYCHAIN_SERVICE, account: 'unexpected', value: secret }],
      [...rows, { service: KEYCHAIN_SERVICE, account: 'unexpected', value: secret }]
    ]
    for (const batch of invalidBatches) {
      let message = ''
      try {
        parsePrivateDistributionSecretBatch(JSON.stringify(batch))
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).not.toBe('')
      expect(message).not.toContain(secret)
    }
  })

  it('discards partial-looking output when the Touch ID batch command fails', () => {
    const secret = 'partial-secret-value'
    const spawn = vi.fn(() => ({
      status: 1,
      stdout: JSON.stringify([
        { service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNTS.keyAlias, value: secret }
      ]),
      stderr: secret
    }))
    let message = ''
    try {
      readPrivateDistributionSecrets(spawn as never)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('Touch ID Keychain batch read failed')
    expect(message).not.toContain(secret)
    expect(spawn).toHaveBeenCalledOnce()
  })

  it('never enables publishing implicitly and requires an explicit tester group', () => {
    expect(parseLocalPublishArgs([])).toMatchObject({ publish: false, groups: null })
    expect(() => parseLocalPublishArgs(['--publish'])).toThrow('--groups is required')
    expect(() => parseLocalPublishArgs(['--existing-apk'])).toThrow(
      '--existing-apk requires --publish'
    )
    expect(parseLocalPublishArgs(['--publish', '--groups', 'trusted, team'])).toMatchObject({
      publish: true,
      groups: 'trusted,team'
    })
    expect(
      parseLocalPublishArgs(['--publish', '--existing-apk', '--groups', 'orca-dev-private'])
    ).toMatchObject({ publish: true, existingApk: true, groups: 'orca-dev-private' })
  })

  it('selects a code above Firebase and local published history', () => {
    expect(
      nextPrivateVersionCode({
        remoteVersionCode: 1_000_400,
        localVersionCode: 1_000_402,
        explicitVersionCode: null
      })
    ).toBe(1_000_403)
    expect(() =>
      nextPrivateVersionCode({
        remoteVersionCode: 1_000_400,
        localVersionCode: 1_000_402,
        explicitVersionCode: 1_000_402
      })
    ).toThrow('must be above 1000402')
    expect(() =>
      nextPrivateVersionCode({
        remoteVersionCode: ANDROID_VERSION_CODE_MAX,
        localVersionCode: 0,
        explicitVersionCode: null
      })
    ).toThrow('at most')
  })

  it('validates service-account identity and keystore encoding without exposing values', () => {
    const credentials = {
      type: 'service_account',
      client_email: 'orca-mobile-distribution@orca-dev-447f3.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
      token_uri: 'https://oauth2.googleapis.com/token'
    }
    expect(parseFirebaseServiceAccount(JSON.stringify(credentials))).toEqual(credentials)
    expect(() =>
      parseFirebaseServiceAccount(
        JSON.stringify({ ...credentials, client_email: 'wrong@example.com' })
      )
    ).toThrow('expected service-account')
    expect(decodeKeystoreBase64(Buffer.from('keystore').toString('base64')).toString()).toBe(
      'keystore'
    )
    expect(() => decodeKeystoreBase64('not base64')).toThrow('single-line base64')
  })

  it('returns only Firebase testing_uri from captured CLI output', () => {
    expect(
      extractTestingUri(
        'firebase_console_uri: https://console.firebase.google.com/x\ntesting_uri: https://appdistribution.firebase.google.com/testerapps/1'
      )
    ).toBe('https://appdistribution.firebase.google.com/testerapps/1')
  })

  it('reads every Firebase release page and rejects malformed Android versions', async () => {
    const pages = [
      { releases: [{ buildVersion: '1000003' }], nextPageToken: 'next' },
      { releases: [{ buildVersion: '1000007' }] }
    ]
    const fetchPage = async () => ({ ok: true, json: async () => pages.shift() })
    expect(await readMaxFirebaseVersionCode('token', fetchPage as never)).toBe(1_000_007)

    const malformedPage = async () => ({
      ok: true,
      json: async () => ({ releases: [{ buildVersion: 'not-a-version' }] })
    })
    await expect(readMaxFirebaseVersionCode('token', malformedPage as never)).rejects.toThrow(
      'invalid Android build version'
    )
  })

  it('recovers the tester link from a confirmed Firebase release', async () => {
    const pages = [
      { releases: [{ buildVersion: '999999' }], nextPageToken: 'next' },
      {
        releases: [
          {
            buildVersion: '1000000',
            testingUri:
              'https://appdistribution.firebase.google.com/testerapps/app/releases/release'
          }
        ]
      }
    ]
    const fetchPage = vi.fn(async () => ({ ok: true, json: async () => pages.shift() }))
    await expect(readFirebaseTestingUri('token', 1_000_000, fetchPage as never)).resolves.toBe(
      'https://appdistribution.firebase.google.com/testerapps/app/releases/release'
    )
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('creates private files and persistent version state with owner-only permissions', () => {
    const privateDirectory = createPrivateTempDirectory()
    tempDirectories.push(privateDirectory)
    const secretPath = join(privateDirectory, 'secret')
    writePrivateFile(secretPath, 'secret')
    expect(statSync(privateDirectory).mode & 0o777).toBe(0o700)
    expect(statSync(secretPath).mode & 0o777).toBe(0o600)

    const stateDirectory = mkdtempSync(join(tmpdir(), 'orca-private-version-test-'))
    tempDirectories.push(stateDirectory)
    const statePath = join(stateDirectory, 'version-code')
    writeLocalPublishedVersionCode(statePath, 1_000_008)
    expect(readLocalPublishedVersionCode(statePath)).toBe(1_000_008)
    expect(statSync(statePath).mode & 0o777).toBe(0o600)
    expect(existsSync(`${statePath}.${process.pid}.tmp`)).toBe(false)
  })

  it('extracts exactly one signer certificate digest for comparison', () => {
    expect(parseApkSignerDigests('Signer #1 certificate SHA-256 digest: AA:bb:01')).toEqual([
      'aabb01'
    ])
  })
})
