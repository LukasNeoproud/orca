import { open } from 'node:fs/promises'
import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { EmulatorBridge } from '../emulator/emulator-bridge'
import {
  discoverAndroidSdkFromHost,
  setConfiguredAndroidSdkPath
} from '../emulator/android/android-sdk-host-discovery'
import {
  createAndroidBuildTerminalRunner,
  type AndroidBuildTerminalHost
} from '../android-app-run/android-build-terminal'
import { resolveLoginShellEnvironment } from '../startup/login-shell-environment'
import { AndroidAppRunService } from '../android-app-run/android-app-run-service'
import { isGradleAndroidProject } from '../android-app-run/gradle-android-project'
import {
  createAndroidApkBuildHost,
  registerAndroidApkBuildHost
} from '../android-app-run/android-apk-build-host'
import { LOCAL_EXECUTION_HOST_ID, getWorktreeExecutionHostId } from '../../shared/execution-host'
import type { Worktree } from '../../shared/worktree/types'
import { resolveRegisteredWorktreePath } from './registered-worktree-roots-cache'
import type {
  AndroidAppRunRequest,
  AndroidAppRunResult,
  AndroidBuildVariantsResult
} from '../../shared/android-app-run-types'

const TRANSCRIPT_TAIL_BYTES = 256 * 1024

/** The directory the newest row of an agent transcript was written from. */
async function readTranscriptWorkingDirectory(transcriptPath: string): Promise<string | null> {
  if (!/\.jsonl$/i.test(transcriptPath)) {
    return null
  }
  const file = await open(transcriptPath, 'r').catch(() => null)
  if (!file) {
    return null
  }
  try {
    const { size } = await file.stat()
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n')
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const row: unknown = JSON.parse(lines[index]!)
        if (row && typeof row === 'object' && 'cwd' in row && typeof row.cwd === 'string') {
          return row.cwd || null
        }
      } catch {
        // The first line of the tail is cut, and the last can be half written.
      }
    }
    return null
  } finally {
    await file.close()
  }
}

/** The slice of the runtime the Android run needs: build terminals and workspace lookup. */
export type AndroidAppRunRuntime = AndroidBuildTerminalHost & {
  showManagedWorktree: (
    worktreeSelector: string
  ) => Promise<Pick<Worktree, 'id' | 'path' | 'repoId' | 'hostId'>>
}

/** Local machine only: the SDK, adb and the emulator live beside the desktop app. */
export function registerAndroidAppRunHandlers(
  store: Store,
  getBridge: () => EmulatorBridge | null,
  getTerminalHost: () => AndroidAppRunRuntime | null
): void {
  const requireBridge = (): EmulatorBridge => {
    const bridge = getBridge()
    if (!bridge) {
      throw new Error('The emulator service is not ready yet.')
    }
    return bridge
  }
  const applySdkSetting = (): void =>
    setConfiguredAndroidSdkPath(store.getSettings().androidSdkPath ?? null)
  const service = new AndroidAppRunService({
    bootDevice: (deviceOrName) => {
      applySdkSetting()
      return requireBridge().ensureAndroidDeviceBooted(deviceOrName)
    },
    installApk: (serial, apkPath) =>
      requireBridge().runCapability('install', { device: serial }, (backend, device) =>
        backend.installApp!(device, apkPath, { reinstall: true })
      ),
    launchApp: (serial, applicationId) =>
      requireBridge().runCapability('launch', { device: serial }, (backend, device) =>
        backend.launchApp!(device, applicationId)
      ),
    buildInTerminal: createAndroidBuildTerminalRunner({
      getHost: getTerminalHost,
      // A fresh worktree has no `local.properties`, so Gradle needs the SDK from the environment.
      resolveEnv: (): Record<string, string> => {
        applySdkSetting()
        const sdkRoot = discoverAndroidSdkFromHost()?.sdkRoot
        return sdkRoot ? { ANDROID_HOME: sdkRoot } : {}
      }
    }),
    resolveEnvironment: async () => ({ ...process.env, ...(await resolveLoginShellEnvironment()) })
  })

  // Paired phones reach the same service through runtime RPC.
  registerAndroidApkBuildHost(
    createAndroidApkBuildHost({
      service,
      resolveWorkspace: async (worktreeSelector) => {
        const runtime = getTerminalHost()
        if (!runtime) {
          throw new Error('runtime_unavailable')
        }
        const worktree = await runtime.showManagedWorktree(worktreeSelector)
        const repo = store.getRepo(worktree.repoId)
        if (getWorktreeExecutionHostId(worktree, repo) !== LOCAL_EXECUTION_HOST_ID) {
          throw new Error('Android builds run only for workspaces on the desktop itself.')
        }
        return {
          worktreeId: worktree.id,
          path: await resolveRegisteredWorktreePath(worktree.path, store),
          savedVariant: repo?.androidBuildVariant
        }
      }
    })
  )

  ipcMain.handle(
    'androidAppRun:isAndroidProject',
    async (_event, args: { worktreePath: string }): Promise<boolean> =>
      isGradleAndroidProject(await resolveRegisteredWorktreePath(args.worktreePath, store))
  )

  ipcMain.handle(
    'androidAppRun:listVariants',
    async (
      _event,
      args: { worktreePath: string; refresh?: boolean }
    ): Promise<AndroidBuildVariantsResult> => ({
      variants: await service.listVariants(
        await resolveRegisteredWorktreePath(args.worktreePath, store),
        { refresh: args.refresh }
      )
    })
  )

  ipcMain.handle(
    'androidAppRun:run',
    async (event, args: AndroidAppRunRequest): Promise<AndroidAppRunResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return service.run({ ...args, worktreePath }, (runEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('androidAppRun:event', runEvent)
        }
      })
    }
  )

  ipcMain.handle(
    'androidAppRun:agentDirectory',
    (_event, args: { transcriptPath: string }): Promise<string | null> =>
      readTranscriptWorkingDirectory(args.transcriptPath).catch(() => null)
  )

  ipcMain.handle('androidAppRun:cancel', (_event, args: { runId: string }): void => {
    service.cancel(args.runId)
  })
}
