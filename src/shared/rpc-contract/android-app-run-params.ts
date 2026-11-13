import { z } from 'zod'
import { ANDROID_ABIS } from '../android-app-run-types'
import { WorktreeSelector } from './files-target-params'

const RunId = z.string().min(8).max(64)

export const AndroidApkBuildListVariantsParams = WorktreeSelector.extend({
  refresh: z.boolean().optional()
})

export const AndroidApkBuildStartParams = WorktreeSelector.extend({
  /** Chosen by the client, so a request repeated after a reconnect joins the run it started. */
  runId: RunId,
  variant: z.string().regex(/^[A-Za-z]\w{0,119}$/, 'Invalid build variant'),
  abi: z.enum(ANDROID_ABIS).optional()
})

export const AndroidApkBuildRunParams = z.object({ runId: RunId })
