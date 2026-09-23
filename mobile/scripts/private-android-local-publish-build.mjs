import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  FIREBASE_TOOLS_VERSION,
  PRIVATE_ANDROID_PACKAGE,
  PRIVATE_FIREBASE_APP_ID,
  TOUCHID_KEYCHAIN_PATH,
  parseApkSignerDigests
} from './private-android-local-publish-contract.mjs'

const versionCollator = new Intl.Collator(undefined, { numeric: true })

export function requireLocalPublishTools({ publish }) {
  if (process.platform !== 'darwin') {
    throw new Error('Local private Android publishing is supported only on macOS')
  }
  for (const tool of ['pnpm', 'keytool']) {
    requireExecutable(tool)
  }
  if (!existsSync(TOUCHID_KEYCHAIN_PATH)) {
    throw new Error(`Required Touch ID Keychain helper is missing: ${TOUCHID_KEYCHAIN_PATH}`)
  }
  if (publish) {
    requireExecutable('npx')
  }
  return {
    apkanalyzer: findAndroidTool('apkanalyzer'),
    apksigner: findAndroidTool('apksigner')
  }
}

export function runPrivateAndroidBuild({ mobileRoot, versionCode, secretPaths, secrets }) {
  const sdkRoot = resolveAndroidSdkRoot()
  const publicEnv = {
    ...process.env,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_PRIVATE_ANDROID_RELEASE: '1',
    ORCA_PRIVATE_ANDROID_PACKAGE: PRIVATE_ANDROID_PACKAGE,
    ORCA_PRIVATE_ANDROID_VERSION_CODE: String(versionCode),
    ORCA_PRIVATE_APP_NAME: 'Orca Dev',
    ORCA_PRIVATE_APP_SCHEME: 'orca-dev'
  }
  runChecked(
    'pnpm',
    [
      'test',
      'src/transport/protocol-compat.test.ts',
      'src/transport/pairing.test.ts',
      'src/transport/pair-confirm-state.test.ts'
    ],
    { cwd: mobileRoot, env: publicEnv, label: 'Mobile protocol tests' }
  )
  runChecked('pnpm', ['typecheck'], {
    cwd: mobileRoot,
    env: publicEnv,
    label: 'Mobile typecheck'
  })
  runChecked(
    'pnpm',
    ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'],
    { cwd: mobileRoot, env: publicEnv, label: 'Expo Android prebuild' }
  )
  const gradlePath = path.join(mobileRoot, 'android', 'gradlew')
  if (!existsSync(gradlePath)) {
    throw new Error('Expo prebuild did not create android/gradlew')
  }
  runChecked(gradlePath, ['--no-daemon', 'assembleRelease'], {
    cwd: path.dirname(gradlePath),
    env: {
      ...publicEnv,
      ORCA_PRIVATE_ANDROID_SIGNING: 'true',
      ORCA_PRIVATE_ANDROID_KEYSTORE_PATH: secretPaths.keystore,
      ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD: secrets.keystorePassword,
      ORCA_PRIVATE_ANDROID_KEY_ALIAS: secrets.keyAlias,
      ORCA_PRIVATE_ANDROID_KEY_PASSWORD: secrets.keyPassword
    },
    label: 'Signed Android release build'
  })
  return findReleaseApk(mobileRoot)
}

export function verifyPrivateApk({
  apkPath,
  expectedPackage,
  expectedVersionCode,
  tools,
  secrets,
  secretPaths
}) {
  const actualPackage = runCaptured(
    tools.apkanalyzer,
    ['manifest', 'application-id', apkPath],
    'APK package verification'
  ).trim()
  const actualVersionCode = Number(
    runCaptured(
      tools.apkanalyzer,
      ['manifest', 'version-code', apkPath],
      'APK version verification'
    ).trim()
  )
  if (actualPackage !== expectedPackage || actualVersionCode !== expectedVersionCode) {
    throw new Error('Built APK identity does not match the requested package and versionCode')
  }
  runChecked(
    'keytool',
    [
      '-exportcert',
      '-keystore',
      secretPaths.keystore,
      '-storepass:env',
      'ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD',
      '-alias',
      secrets.keyAlias,
      '-file',
      secretPaths.signingCertificate,
      '-noprompt'
    ],
    {
      env: { ...process.env, ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD: secrets.keystorePassword },
      label: 'Keystore certificate validation',
      quiet: true
    }
  )
  const expectedDigest = createHash('sha256')
    .update(readFileSync(secretPaths.signingCertificate))
    .digest('hex')
  const signerOutput = runCaptured(
    tools.apksigner,
    ['verify', '--verbose', '--print-certs', apkPath],
    'APK signature verification'
  )
  const signerDigests = [...new Set(parseApkSignerDigests(signerOutput))]
  if (signerDigests.length !== 1 || signerDigests[0] !== expectedDigest) {
    throw new Error('Built APK signer does not match the private release keystore')
  }
}

export function uploadPrivateApk({ apkPath, groups, notesPath, credentialsPath }) {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      `firebase-tools@${FIREBASE_TOOLS_VERSION}`,
      'appdistribution:distribute',
      apkPath,
      '--app',
      PRIVATE_FIREBASE_APP_ID,
      '--groups',
      groups,
      '--release-notes-file',
      notesPath
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credentialsPath },
      maxBuffer: 10 * 1024 * 1024
    }
  )
  if (result.error || result.status !== 0) {
    throw new Error('Pinned Firebase CLI upload failed')
  }
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

function findAndroidTool(tool) {
  const direct = findExecutable(tool)
  if (direct) {
    return direct
  }
  const sdkRoot = resolveAndroidSdkRoot()
  const parent = tool === 'apksigner' ? 'build-tools' : 'cmdline-tools'
  const parentPath = path.join(sdkRoot, parent)
  if (existsSync(parentPath)) {
    const candidate = readdirSync(parentPath)
      .sort((left, right) => versionCollator.compare(right, left))
      .map((version) =>
        tool === 'apksigner'
          ? path.join(parentPath, version, tool)
          : path.join(parentPath, version, 'bin', tool)
      )
      .find(existsSync)
    if (candidate) {
      return candidate
    }
  }
  throw new Error(`Required Android SDK tool is missing: ${tool}`)
}

function resolveAndroidSdkRoot() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'Library', 'Android', 'sdk')
  )
}

function requireExecutable(command) {
  if (!findExecutable(command)) {
    throw new Error(`Required tool is missing from PATH: ${command}`)
  }
}

function findExecutable(command) {
  return (
    String(process.env.PATH || '')
      .split(path.delimiter)
      .map((directory) => path.join(directory, command))
      .find(existsSync) ?? null
  )
}

function findReleaseApk(mobileRoot) {
  const releaseDirectory = path.join(
    mobileRoot,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release'
  )
  if (!existsSync(releaseDirectory)) {
    throw new Error('Gradle did not create a release APK directory')
  }
  const apks = readdirSync(releaseDirectory)
    .filter((name) => name.endsWith('.apk'))
    .map((name) => path.join(releaseDirectory, name))
  if (apks.length !== 1) {
    throw new Error(`Expected exactly one release APK, found ${apks.length}`)
  }
  return apks[0]
}

function runChecked(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit'
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${options.label} failed`)
  }
}

function runCaptured(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed`)
  }
  return String(result.stdout || '')
}
