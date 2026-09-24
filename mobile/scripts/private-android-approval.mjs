import { createHash } from 'node:crypto'
import {
  PRIVATE_ANDROID_PACKAGE,
  PRIVATE_FIREBASE_APP_ID
} from './private-android-local-publish-contract.mjs'
import { runPrivateAndroidGit } from './private-android-local-publish-build.mjs'

export function readCleanAndroidPublishHead(mobileRoot, runGit = runPrivateAndroidGit) {
  const head = runGit(['rev-parse', '--verify', 'HEAD'], mobileRoot).trim()
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(head)) {
    throw new Error('Unable to identify the Android publish commit')
  }
  const status = runGit(['status', '--porcelain', '--untracked-files=normal'], mobileRoot)
  if (status.trim()) {
    throw new Error('Mobile approval requires a clean committed worktree')
  }
  return head
}

export function assertAndroidPublishHeadUnchanged(
  mobileRoot,
  commit,
  runGit = runPrivateAndroidGit
) {
  if (readCleanAndroidPublishHead(mobileRoot, runGit) !== commit) {
    throw new Error('Android publish source changed after mobile approval')
  }
}

export function privateAndroidApprovalOperation({ options, commit }) {
  if (options.approval !== 'mobile') {
    throw new Error('Mobile approval operation requires --approval mobile')
  }
  if (options.publish && !options.releaseNotes) {
    throw new Error('Mobile approval publish requires explicit release notes')
  }
  const groups = options.publish ? [...new Set(options.groups.split(','))].sort() : []
  return {
    kind: 'private-android-distribution',
    mode: options.publish ? 'publish' : 'build',
    commit,
    firebaseAppId: PRIVATE_FIREBASE_APP_ID,
    packageName: PRIVATE_ANDROID_PACKAGE,
    groups,
    releaseNotesSha256: createHash('sha256')
      .update(options.publish ? `${options.releaseNotes}\n` : '', 'utf8')
      .digest('hex')
  }
}
