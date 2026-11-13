import { randomUUID } from 'expo-crypto'
import type { RpcClient } from '../transport/rpc-client'
import { isMobileMethodUnavailableError } from '../transport/mobile-method-unavailable'
import type { MobileApkBuild } from './mobile-apk-builds'

export type HostApkBuildProbe = { supported: boolean; savedVariant?: string }

type BuildStatus = {
  phase: 'build' | 'done' | 'failed' | 'cancelled'
  apk?: { relativePath: string; size: number }
  error?: string
}
type FileStat = { size: number; mtime: number; isDirectory: boolean }

const POLL_INTERVAL_MS = 2_000
// A cold Gradle daemon configuring a large project takes minutes before it can list anything.
const LIST_VARIANTS_TIMEOUT_MS = 10 * 60_000
// About a minute of unanswered polls: the build keeps running on the host, the phone gave up.
const MAX_CONSECUTIVE_POLL_FAILURES = 30

class HostBuildUnavailableError extends Error {}

async function request<T>(
  client: RpcClient,
  method: string,
  params: unknown,
  timeoutMs = 30_000
): Promise<T> {
  const response = await client.sendRequest(method, params, { timeoutMs })
  if (!response.ok) {
    if (isMobileMethodUnavailableError(response.error.code, response.error.message)) {
      throw new HostBuildUnavailableError('Update the paired Orca desktop to build from here.')
    }
    throw new Error(response.error.message || `${method} failed`)
  }
  return response.result as T
}

/** Whether the desktop can build this workspace: an Android project on a host new enough. */
export async function probeHostApkBuild(
  client: RpcClient,
  worktreeId: string
): Promise<HostApkBuildProbe> {
  try {
    const probe = await request<{ isAndroidProject: boolean; savedVariant?: string }>(
      client,
      'androidAppRun.probe',
      { worktree: `id:${worktreeId}` }
    )
    return { supported: probe.isAndroidProject, savedVariant: probe.savedVariant }
  } catch (error) {
    // An older desktop, or a headless server with no SDK, simply does not offer the build.
    if (error instanceof HostBuildUnavailableError || isHostWithoutBuild(error)) {
      return { supported: false }
    }
    throw error
  }
}

function isHostWithoutBuild(error: unknown): boolean {
  return error instanceof Error && error.message.includes('android_app_run_unavailable')
}

export async function listHostBuildVariants(
  client: RpcClient,
  worktreeId: string,
  refresh = false
): Promise<string[]> {
  const result = await request<{ variants: string[] }>(
    client,
    'androidAppRun.listVariants',
    { worktree: `id:${worktreeId}`, refresh },
    LIST_VARIANTS_TIMEOUT_MS
  )
  return result.variants
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Builds a variant on the desktop and resolves with its APK, ready for `installMobileApkBuild`.
 * `abi` limits the APK's native code to this phone's ABI, which is most of a typical APK's size.
 */
export async function buildApkOnHost(
  client: RpcClient,
  worktreeId: string,
  variant: string,
  options: { abi: string | null; signal: AbortSignal; pollIntervalMs?: number }
): Promise<MobileApkBuild> {
  const { signal } = options
  const worktree = `id:${worktreeId}`
  const runId = randomUUID()
  await request(client, 'androidAppRun.buildApk', {
    worktree,
    runId,
    variant,
    ...(options.abi ? { abi: options.abi } : {})
  })
  let failures = 0
  for (;;) {
    await sleep(options.pollIntervalMs ?? POLL_INTERVAL_MS, signal)
    if (signal.aborted) {
      void client.sendRequest('androidAppRun.cancel', { runId }).catch(() => {})
      throw new Error('Build cancelled.')
    }
    let status: BuildStatus
    try {
      status = await request<BuildStatus>(client, 'androidAppRun.buildStatus', { runId })
      failures = 0
    } catch (error) {
      // A dropped connection must not lose a build that is still running on the host.
      const lost = error instanceof Error && error.message.includes('android_build_run_not_found')
      if (lost || (failures += 1) > MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error('Lost track of the build on the desktop.', { cause: error })
      }
      continue
    }
    if (status.phase === 'build') {
      continue
    }
    if (status.phase !== 'done' || !status.apk) {
      throw new Error(
        status.phase === 'cancelled'
          ? 'Build cancelled.'
          : status.error || 'The build failed. See the Run app terminal on the desktop.'
      )
    }
    const stat = await request<FileStat>(client, 'files.stat', {
      worktree,
      relativePath: status.apk.relativePath
    })
    return { relativePath: status.apk.relativePath, size: stat.size, mtime: stat.mtime }
  }
}
