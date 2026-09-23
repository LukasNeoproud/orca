#!/usr/bin/env node

import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  KEYCHAIN_ACCOUNTS,
  KEYCHAIN_SERVICE,
  PRIVATE_ANDROID_PACKAGE,
  PRIVATE_FIREBASE_APP_ID,
  decodeKeystoreBase64,
  extractTestingUri,
  nextPrivateVersionCode,
  parseFirebaseServiceAccount,
  parseLocalPublishArgs
} from './private-android-local-publish-contract.mjs'
import {
  requireLocalPublishTools,
  runPrivateAndroidBuild,
  uploadPrivateApk,
  verifyPrivateApk
} from './private-android-local-publish-build.mjs'
import {
  cleanupPrivateTempDirectory,
  createFirebaseAccessToken,
  createPrivateTempDirectory,
  readLocalPublishedVersionCode,
  readMaxFirebaseVersionCode,
  readPrivateDistributionSecrets,
  writeLocalPublishedVersionCode,
  writePrivateFile
} from './private-android-local-publish-runtime.mjs'

const mobileRoot = path.resolve(import.meta.dirname, '..')
const versionStatePath = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Orca',
  'private-android-version-code'
)

export async function runLocalPrivateAndroidPublish(argv) {
  const options = parseLocalPublishArgs(argv)
  if (options.help) {
    printHelp()
    return
  }
  const priorUmask = process.umask(0o077)
  let tempDirectory = null
  const cleanup = () => cleanupPrivateTempDirectory(tempDirectory)
  const interrupt = () => {
    cleanup()
    process.exit(130)
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    const tools = requireLocalPublishTools(options)
    const secrets = readPrivateDistributionSecrets()
    const credentials = parseFirebaseServiceAccount(secrets.firebaseJson)
    const accessToken = await createFirebaseAccessToken(credentials)
    const remoteVersionCode = await readMaxFirebaseVersionCode(accessToken)
    const localVersionCode = readLocalPublishedVersionCode(versionStatePath)
    const versionCode = nextPrivateVersionCode({
      remoteVersionCode,
      localVersionCode,
      explicitVersionCode: options.versionCode
    })

    tempDirectory = createPrivateTempDirectory()
    const secretPaths = {
      keystore: path.join(tempDirectory, 'private-release.keystore'),
      credentials: path.join(tempDirectory, 'firebase-service-account.json'),
      signingCertificate: path.join(tempDirectory, 'signing-certificate.der'),
      releaseNotes: path.join(tempDirectory, 'release-notes.txt')
    }
    writePrivateFile(secretPaths.keystore, decodeKeystoreBase64(secrets.keystoreBase64))
    writePrivateFile(secretPaths.credentials, `${JSON.stringify(credentials)}\n`)

    console.log(`Building ${PRIVATE_ANDROID_PACKAGE} with versionCode ${versionCode}`)
    const apkPath = runPrivateAndroidBuild({
      mobileRoot,
      versionCode,
      secretPaths,
      secrets
    })
    verifyPrivateApk({
      apkPath,
      expectedPackage: PRIVATE_ANDROID_PACKAGE,
      expectedVersionCode: versionCode,
      tools,
      secrets,
      secretPaths
    })
    console.log(`Verified signed APK: ${apkPath}`)
    if (!options.publish) {
      console.log('Build complete. Upload was not requested; rerun with --publish and --groups.')
      return
    }

    const uploadAccessToken = await createFirebaseAccessToken(credentials)
    const currentRemoteVersionCode = await readMaxFirebaseVersionCode(uploadAccessToken)
    if (currentRemoteVersionCode >= versionCode) {
      throw new Error(
        `Firebase already has versionCode ${currentRemoteVersionCode}; rerun to build a newer APK`
      )
    }
    const notes =
      options.releaseNotes || `Private Orca Android ${versionCode} (${PRIVATE_ANDROID_PACKAGE})`
    writePrivateFile(secretPaths.releaseNotes, `${notes}\n`)
    const output = uploadPrivateApk({
      apkPath,
      groups: options.groups,
      notesPath: secretPaths.releaseNotes,
      credentialsPath: secretPaths.credentials
    })
    const testingUri = extractTestingUri(output)
    if (!testingUri) {
      throw new Error('Firebase upload returned no testing_uri')
    }
    writeLocalPublishedVersionCode(versionStatePath, versionCode)
    console.log(`testing_uri: ${testingUri}`)
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
    cleanup()
    process.umask(priorUmask)
  }
}

function printHelp() {
  console.log(`Usage: node scripts/publish-private-android-local.mjs [options]

Builds a signed ${PRIVATE_ANDROID_PACKAGE} APK. Upload occurs only with --publish.

Options:
  --publish                 Upload with firebase-tools after verification
  --groups <aliases>        Comma-separated Firebase tester group aliases
  --release-notes <text>    Release notes used with --publish
  --version-code <integer>  Explicit code above Firebase and local history
  --help                    Show this help

Keychain service: ${KEYCHAIN_SERVICE}
Keychain accounts: ${Object.values(KEYCHAIN_ACCOUNTS).join(', ')}
Firebase App ID: ${PRIVATE_FIREBASE_APP_ID}`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === path.resolve(import.meta.filename)) {
  runLocalPrivateAndroidPublish(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
