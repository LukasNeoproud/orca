import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANDROID_VERSION_CODE_MAX,
  KEYCHAIN_ACCOUNTS,
  KEYCHAIN_SERVICE,
  PRIVATE_ANDROID_PACKAGE,
  PRIVATE_FIREBASE_APP_ID,
  TOUCHID_KEYCHAIN_PATH,
  classifyExistingPrivateApkVersion,
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
  distributeExistingFirebaseRelease,
  parsePrivateDistributionSecretBatch,
  readLocalPublishedVersionCode,
  readFirebaseTestingUri,
  readMaxFirebaseVersionCode,
  readPrivateDistributionSecrets,
  writeLocalPublishedVersionCode,
  writePrivateFile
} from '../../scripts/private-android-local-publish-runtime.mjs'
import {
  assertAndroidPublishHeadUnchanged,
  privateAndroidApprovalOperation,
  readCleanAndroidPublishHead
} from '../../scripts/private-android-approval.mjs'

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

  it('routes mobile approval through the native verifier with the exact batch', () => {
    const rows = Object.values(KEYCHAIN_ACCOUNTS).map((account) => ({
      service: KEYCHAIN_SERVICE,
      account,
      value: `value:${account}`
    }))
    const spawn = vi.fn(() => ({ status: 0, stdout: JSON.stringify(rows) }))
    readPrivateDistributionSecrets(spawn as never, '/tmp/approval-context.json')
    expect(spawn).toHaveBeenCalledWith(
      TOUCHID_KEYCHAIN_PATH,
      [
        'get-mobile',
        '--json',
        '--context-file',
        '/tmp/approval-context.json',
        ...Object.values(KEYCHAIN_ACCOUNTS).flatMap((account) => [KEYCHAIN_SERVICE, account])
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    )
  })

  it('binds mobile approval to a clean commit and explicit publish intent', () => {
    const commit = 'a'.repeat(40)
    const cleanGit = vi.fn((args) => (args[0] === 'rev-parse' ? `${commit}\n` : ''))
    expect(readCleanAndroidPublishHead('/repo/mobile', cleanGit as never)).toBe(commit)
    expect(() =>
      assertAndroidPublishHeadUnchanged('/repo/mobile', commit, cleanGit as never)
    ).not.toThrow()
    const dirtyGit = vi.fn((args) =>
      args[0] === 'rev-parse' ? `${commit}\n` : ' M mobile/source.ts\n'
    )
    expect(() => readCleanAndroidPublishHead('/repo/mobile', dirtyGit as never)).toThrow('clean')
    const options = parseLocalPublishArgs([
      '--approval',
      'mobile',
      '--publish',
      '--groups',
      'zeta,alpha',
      '--release-notes',
      'Release'
    ])
    expect(privateAndroidApprovalOperation({ options, commit })).toMatchObject({
      mode: 'publish',
      commit,
      groups: ['alpha', 'zeta'],
      releaseNotesSha256: createHash('sha256').update('Release\n').digest('hex')
    })
    expect(
      privateAndroidApprovalOperation({
        options: { ...options, publish: false, groups: 'ignored', releaseNotes: null },
        commit
      }).groups
    ).toEqual([])
    expect(
      privateAndroidApprovalOperation({
        options: { ...options, groups: 'zeta,alpha,zeta' },
        commit
      }).groups
    ).toEqual(['alpha', 'zeta'])
    expect(() =>
      parseLocalPublishArgs(['--approval', 'mobile', '--publish', '--groups', 'test'])
    ).toThrow('--release-notes is required')
    expect(() =>
      parseLocalPublishArgs([
        '--approval',
        'mobile',
        '--publish',
        '--existing-apk',
        '--groups',
        'test',
        '--release-notes',
        'Release'
      ])
    ).toThrow('--existing-apk is not yet supported')
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

  it('recovers an uploaded existing APK and rejects stale or mismatched builds', () => {
    const existing = {
      apkVersionCode: 1_000_004,
      localVersionCode: 1_000_003,
      explicitVersionCode: null
    }
    expect(classifyExistingPrivateApkVersion({ ...existing, remoteVersionCode: 1_000_004 })).toBe(
      'already-published'
    )
    expect(classifyExistingPrivateApkVersion({ ...existing, remoteVersionCode: 1_000_003 })).toBe(
      'upload'
    )
    expect(() =>
      classifyExistingPrivateApkVersion({ ...existing, remoteVersionCode: 1_000_005 })
    ).toThrow('older than published release history')
    expect(() =>
      classifyExistingPrivateApkVersion({
        ...existing,
        remoteVersionCode: 1_000_003,
        explicitVersionCode: 1_000_005
      })
    ).toThrow('does not match')
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

  it('completes notes and group distribution for an uploaded release without another APK upload', async () => {
    const release = {
      name: `projects/100414786379/apps/${PRIVATE_FIREBASE_APP_ID}/releases/abc123`,
      buildVersion: '1000004',
      testingUri: 'https://appdistribution.firebase.google.com/testerapps/app/releases/abc123'
    }
    const responses = [
      { ok: true, json: async () => ({ releases: [release] }) },
      { ok: true },
      { ok: true }
    ]
    const fetchPage = vi.fn(async (_url: string | URL, _options?: RequestInit) => responses.shift())

    await expect(
      distributeExistingFirebaseRelease(
        { accessToken: 'token', versionCode: 1_000_004, groups: 'trusted,team', notes: 'notes\n' },
        fetchPage as never
      )
    ).resolves.toBe(release.testingUri)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    const [notesUrl, notesOptions] = fetchPage.mock.calls[1]
    expect(String(notesUrl)).toContain(`/${release.name.replaceAll(':', '%3A')}?updateMask=`)
    expect(notesOptions).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: release.name, releaseNotes: { text: 'notes\n' } })
    })
    const [groupsUrl, groupsOptions] = fetchPage.mock.calls[2]
    expect(String(groupsUrl)).toContain(`/${release.name.replaceAll(':', '%3A')}:distribute`)
    expect(groupsOptions).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ testerEmails: [], groupAliases: ['trusted', 'team'] })
    })
  })

  it('rejects a failed group distribution so the release can be retried', async () => {
    const release = {
      name: `projects/100414786379/apps/${PRIVATE_FIREBASE_APP_ID}/releases/abc123`,
      buildVersion: '1000004',
      testingUri: 'https://appdistribution.firebase.google.com/testerapps/app/releases/abc123'
    }
    const responses = [
      { ok: true, json: async () => ({ releases: [release] }) },
      { ok: true },
      { ok: false, status: 400 }
    ]
    const fetchPage = vi.fn(async () => responses.shift())
    await expect(
      distributeExistingFirebaseRelease(
        { accessToken: 'token', versionCode: 1_000_004, groups: 'trusted', notes: 'notes\n' },
        fetchPage as never
      )
    ).rejects.toThrow('Unable to distribute Firebase release (HTTP 400)')
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

  it('retries an uploaded APK distribution before marking its version published', async () => {
    const distributeRelease = vi
      .fn()
      .mockRejectedValueOnce(new Error('distribution failed'))
      .mockResolvedValue(
        'https://appdistribution.firebase.google.com/testerapps/app/releases/abc123'
      )
    const writeVersion = vi.fn()
    const uploadApk = vi.fn()
    const verifyApk = vi.fn(() => 1_000_004)
    vi.doMock('../../scripts/private-android-local-publish-build.mjs', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      findReleaseApk: () => '/tmp/private.apk',
      requireLocalPublishTools: () => ({}),
      uploadPrivateApk: uploadApk,
      verifyPrivateApk: verifyApk
    }))
    vi.doMock(
      '../../scripts/private-android-local-publish-runtime.mjs',
      async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        cleanupPrivateTempDirectory: vi.fn(),
        createFirebaseAccessToken: vi.fn(async () => 'token'),
        createPrivateTempDirectory: vi.fn(() => '/tmp/private-publish-test'),
        distributeExistingFirebaseRelease: distributeRelease,
        readLocalPublishedVersionCode: vi.fn(() => 1_000_003),
        readMaxFirebaseVersionCode: vi.fn(async () => 1_000_004),
        readPrivateDistributionSecrets: vi.fn(() => ({
          keystoreBase64: Buffer.from('keystore').toString('base64'),
          firebaseJson: JSON.stringify({
            type: 'service_account',
            client_email: 'orca-mobile-distribution@orca-dev-447f3.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
            token_uri: 'https://oauth2.googleapis.com/token'
          })
        })),
        writeLocalPublishedVersionCode: writeVersion,
        writePrivateFile: vi.fn()
      })
    )
    vi.resetModules()
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Worker-thread pools refuse to set the umask.
    const umask = vi.spyOn(process, 'umask').mockReturnValue(0o022)
    try {
      const { runLocalPrivateAndroidPublish } =
        await import('../../scripts/publish-private-android-local.mjs')
      const args = ['--existing-apk', '--publish', '--groups', 'trusted']
      await expect(runLocalPrivateAndroidPublish(args)).rejects.toThrow('distribution failed')
      expect(writeVersion).not.toHaveBeenCalled()
      await expect(runLocalPrivateAndroidPublish(args)).resolves.toBeUndefined()
      expect(verifyApk).toHaveBeenCalledTimes(2)
      expect(distributeRelease).toHaveBeenCalledTimes(2)
      expect(uploadApk).not.toHaveBeenCalled()
      expect(writeVersion).toHaveBeenCalledOnce()
      expect(writeVersion).toHaveBeenCalledWith(expect.any(String), 1_000_004)
    } finally {
      consoleLog.mockRestore()
      umask.mockRestore()
      vi.doUnmock('../../scripts/private-android-local-publish-build.mjs')
      vi.doUnmock('../../scripts/private-android-local-publish-runtime.mjs')
      vi.resetModules()
    }
  })
})
