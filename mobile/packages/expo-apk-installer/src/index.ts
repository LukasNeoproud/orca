import { requireOptionalNativeModule } from 'expo-modules-core'

type NativeApkInstaller = {
  install(localApkPath: string): Promise<void>
  startDownloadNotification(title: string): Promise<void>
  updateDownloadNotification(progressPercent: number): Promise<void>
  markDownloadReady(): Promise<void>
  stopDownloadNotification(): Promise<void>
}

const nativeModule = requireOptionalNativeModule<NativeApkInstaller>('ExpoApkInstaller')

function requireApkInstaller(): NativeApkInstaller {
  if (!nativeModule) {
    throw new Error('APK installation requires the Android native app.')
  }
  return nativeModule
}

/** Resolves only after the user confirms installation in Android's system installer. */
export async function installApk(localApkPath: string): Promise<void> {
  await requireApkInstaller().install(localApkPath)
}

export async function startApkDownloadNotification(title: string): Promise<void> {
  await requireApkInstaller().startDownloadNotification(title)
}

export async function updateApkDownloadNotification(progressPercent: number): Promise<void> {
  await requireApkInstaller().updateDownloadNotification(progressPercent)
}

export async function markApkDownloadReady(): Promise<void> {
  await requireApkInstaller().markDownloadReady()
}

export async function stopApkDownloadNotification(): Promise<void> {
  await requireApkInstaller().stopDownloadNotification()
}
