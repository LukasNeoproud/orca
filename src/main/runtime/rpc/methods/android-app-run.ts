import {
  AndroidApkBuildListVariantsParams,
  AndroidApkBuildRunParams,
  AndroidApkBuildStartParams
} from '../../../../shared/rpc-contract/android-app-run-params'
import {
  getAndroidApkBuildHost,
  type AndroidApkBuildHost
} from '../../../android-app-run/android-apk-build-host'
import { WorktreeSelector } from '../../../../shared/rpc-contract/files-target-params'
import { defineMethod } from '../core'

// Why a refusal and not a crash: only the desktop main process registers a build host, and a
// client must read its absence the same way it reads an older host's method_not_found.
function buildHost(): AndroidApkBuildHost {
  const registered = getAndroidApkBuildHost()
  if (!registered) {
    throw new Error('android_app_run_unavailable')
  }
  return registered
}

/** Builds an Android project on the host for a paired phone, which then fetches the APK. */
export const ANDROID_APP_RUN_METHODS = [
  defineMethod({
    name: 'androidAppRun.probe',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params) => buildHost().probe(params.worktree)
  }),
  defineMethod({
    name: 'androidAppRun.listVariants',
    permission: 'workspace',
    params: AndroidApkBuildListVariantsParams,
    handler: async (params) => buildHost().listVariants(params.worktree, params.refresh)
  }),
  defineMethod({
    name: 'androidAppRun.buildApk',
    permission: 'workspace',
    params: AndroidApkBuildStartParams,
    handler: async (params) => buildHost().start(params)
  }),
  defineMethod({
    name: 'androidAppRun.buildStatus',
    permission: 'workspace',
    params: AndroidApkBuildRunParams,
    handler: async (params) => buildHost().status(params.runId)
  }),
  defineMethod({
    name: 'androidAppRun.cancel',
    permission: 'workspace',
    params: AndroidApkBuildRunParams,
    handler: async (params) => {
      buildHost().cancel(params.runId)
      return { ok: true }
    }
  })
]
