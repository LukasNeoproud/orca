import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { EmulatorBridge } from '../emulator/emulator-bridge'
import { setConfiguredAndroidSdkPath } from '../emulator/android/android-sdk-host-discovery'
import { resolveLoginShellEnvironment } from '../startup/login-shell-environment'
import { AndroidAppRunService } from '../android-app-run/android-app-run-service'
import { isGradleAndroidProject } from '../android-app-run/gradle-android-project'
import { resolveRegisteredWorktreePath } from './registered-worktree-roots-cache'
import type {
  AndroidAppRunRequest,
  AndroidAppRunResult,
  AndroidBuildVariantsResult
} from '../../shared/android-app-run-types'

/** Local machine only: the SDK, adb and the emulator live beside the desktop app. */
export function registerAndroidAppRunHandlers(
  store: Store,
  getBridge: () => EmulatorBridge | null
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
    resolveEnvironment: async () => ({ ...process.env, ...(await resolveLoginShellEnvironment()) })
  })

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

  ipcMain.handle('androidAppRun:cancel', (_event, args: { runId: string }): void => {
    service.cancel(args.runId)
  })
}
